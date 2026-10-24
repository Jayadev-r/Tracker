import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type { Category, CategoryType } from '../types'
import { categorySchema } from '../db/schema'
import { generateUuid } from '../utils/ids'
import { ValidationError, NotFoundError } from '../utils/errors'

export interface CreateCategoryInput {
  name: string
  type: CategoryType
  icon?: string
  color?: string
  aliases?: string[]
}

export interface UpdateCategoryInput {
  name?: string
  icon?: string
  color?: string
  aliases?: string[]
}

export class CategoryService {
  private readonly db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Lists categories, optionally filtered by type and archival status.
   */
  async listCategories(options?: {
    type?: CategoryType
    includeArchived?: boolean
  }): Promise<Category[]> {
    let collection = this.db.categories.toCollection()

    if (options?.type) {
      collection = this.db.categories.where('type').equals(options.type)
    }

    const categories = await collection.toArray()

    let filtered = categories
    if (!options?.includeArchived) {
      filtered = filtered.filter((c) => !c.isArchived)
    }

    // Sort alphabetically by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Retrieves a category by ID.
   */
  async getCategoryById(id: string): Promise<Category | undefined> {
    return this.db.categories.get(id)
  }

  /**
   * Creates a new custom category with validation.
   */
  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      throw new ValidationError('Category name cannot be empty.')
    }
    if (trimmedName.length > 50) {
      throw new ValidationError('Category name must not exceed 50 characters.')
    }

    // Check duplicate active name of same type (case-insensitive)
    const existing = await this.db.categories
      .filter((c) => !c.isArchived && c.type === input.type && c.name.toLowerCase() === trimmedName.toLowerCase())
      .first()

    if (existing) {
      throw new ValidationError(
        `Category "${trimmedName}" already exists for ${input.type}.`
      )
    }

    // Clean and normalize aliases
    const normalizedAliases = this.normalizeAliases(input.aliases ?? [])

    // Check alias conflict across active categories
    await this.validateAliasConflicts(normalizedAliases, input.type)

    const now = new Date().toISOString()
    const category: Category = {
      id: generateUuid(),
      name: trimmedName,
      type: input.type,
      icon: input.icon?.trim() || 'Tag',
      color: input.color?.trim() || '#64748b',
      aliases: normalizedAliases,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }

    const validated = categorySchema.parse(category)
    await this.db.categories.add(validated)
    return validated
  }

  /**
   * Updates an existing category.
   */
  async updateCategory(id: string, updates: UpdateCategoryInput): Promise<Category> {
    const category = await this.getCategoryById(id)
    if (!category) {
      throw new NotFoundError('Category', id)
    }

    let updatedName = category.name
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) {
        throw new ValidationError('Category name cannot be empty.')
      }
      if (trimmed.length > 50) {
        throw new ValidationError('Category name must not exceed 50 characters.')
      }

      // Check duplicate name if changed
      if (trimmed.toLowerCase() !== category.name.toLowerCase()) {
        const existing = await this.db.categories
          .filter(
            (c) =>
              c.id !== id &&
              !c.isArchived &&
              c.type === category.type &&
              c.name.toLowerCase() === trimmed.toLowerCase()
          )
          .first()
        if (existing) {
          throw new ValidationError(
            `Another category named "${trimmed}" already exists.`
          )
        }
      }
      updatedName = trimmed
    }

    let updatedAliases = category.aliases
    if (updates.aliases !== undefined) {
      updatedAliases = this.normalizeAliases(updates.aliases)
      await this.validateAliasConflicts(updatedAliases, category.type, id)
    }

    const now = new Date().toISOString()
    const updatedCategory: Category = {
      ...category,
      name: updatedName,
      icon: updates.icon?.trim() || category.icon,
      color: updates.color?.trim() || category.color,
      aliases: updatedAliases,
      updatedAt: now,
    }

    const validated = categorySchema.parse(updatedCategory)
    await this.db.categories.put(validated)
    return validated
  }

  /**
   * Archives a category so it cannot be chosen for new transactions.
   */
  async archiveCategory(id: string): Promise<Category> {
    const category = await this.getCategoryById(id)
    if (!category) {
      throw new NotFoundError('Category', id)
    }

    if (category.isArchived) {
      return category
    }

    const now = new Date().toISOString()
    const updated: Category = {
      ...category,
      isArchived: true,
      updatedAt: now,
    }

    await this.db.categories.put(updated)
    return updated
  }

  /**
   * Restores an archived category to active status.
   */
  async restoreCategory(id: string): Promise<Category> {
    const category = await this.getCategoryById(id)
    if (!category) {
      throw new NotFoundError('Category', id)
    }

    if (!category.isArchived) {
      return category
    }

    // Ensure no active category of same type has the same name
    const conflictingName = await this.db.categories
      .filter(
        (c) =>
          c.id !== id &&
          !c.isArchived &&
          c.type === category.type &&
          c.name.toLowerCase() === category.name.toLowerCase()
      )
      .first()

    if (conflictingName) {
      throw new ValidationError(
        `Cannot restore category: an active category named "${category.name}" already exists.`
      )
    }

    // Validate alias conflicts with active categories
    await this.validateAliasConflicts(category.aliases, category.type, id)

    const now = new Date().toISOString()
    const updated: Category = {
      ...category,
      isArchived: false,
      updatedAt: now,
    }

    await this.db.categories.put(updated)
    return updated
  }

  /**
   * Deletes a category if and only if no transactions or budgets reference it.
   * If transactions reference it, throws ValidationError recommending archival.
   */
  async deleteCategory(id: string): Promise<void> {
    const category = await this.getCategoryById(id)
    if (!category) {
      throw new NotFoundError('Category', id)
    }

    const txCount = await this.db.transactions.where('categoryId').equals(id).count()
    if (txCount > 0) {
      throw new ValidationError(
        `Cannot delete category "${category.name}": it is referenced by ${txCount} historical transaction(s). Archive it instead.`
      )
    }

    const budgetCount = await this.db.budgets.where('categoryId').equals(id).count()
    if (budgetCount > 0) {
      throw new ValidationError(
        `Cannot delete category "${category.name}": it is referenced by ${budgetCount} budget(s). Delete associated budgets first or archive this category.`
      )
    }

    await this.db.categories.delete(id)
  }

  private normalizeAliases(aliases: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    for (const raw of aliases) {
      const trimmed = raw.trim().toLowerCase()
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed)
        result.push(trimmed)
      }
    }

    return result
  }

  private async validateAliasConflicts(
    aliases: string[],
    categoryType: CategoryType,
    excludeCategoryId?: string
  ): Promise<void> {
    if (aliases.length === 0) return

    const activeCategories = await this.db.categories
      .filter((c) => !c.isArchived && c.type === categoryType && c.id !== excludeCategoryId)
      .toArray()

    for (const alias of aliases) {
      for (const cat of activeCategories) {
        if (cat.name.toLowerCase() === alias) {
          throw new ValidationError(
            `Alias "${alias}" conflicts with category name "${cat.name}".`
          )
        }
        if (cat.aliases.includes(alias)) {
          throw new ValidationError(
            `Alias "${alias}" conflicts with an existing alias for category "${cat.name}".`
          )
        }
      }
    }
  }
}

export const categoryService = new CategoryService()
