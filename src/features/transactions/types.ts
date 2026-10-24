import type { Transaction, Category, Account } from '../../types'

export type DisplayTransactionItem =
  | {
      kind: 'standard'
      transaction: Transaction
      category?: Category
      account?: Account
    }
  | {
      kind: 'transfer'
      transferGroupId: string
      sourceTransaction: Transaction
      destinationTransaction: Transaction
      sourceAccount?: Account
      destinationAccount?: Account
      amountPaise: number
      transactionDate: string
      description: string
    }
  | {
      kind: 'malformed_transfer'
      transferGroupId: string
      transactions: Transaction[]
      error: string
    }

/**
 * Groups raw persisted transactions into logical display items.
 * Specifically groups the two halves of a transfer (source and destination)
 * into a single logical transfer entry so transfers are never displayed
 * as two disjoint ordinary transactions or double-counted.
 */
export function groupTransactionsForDisplay(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[]
): DisplayTransactionItem[] {
  const accountMap = new Map<string, Account>()
  for (const acc of accounts) {
    accountMap.set(acc.id, acc)
  }

  const categoryMap = new Map<string, Category>()
  for (const cat of categories) {
    categoryMap.set(cat.id, cat)
  }

  // Pre-group transfer sides by transferGroupId
  const transferGroups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type === 'transfer' && tx.transferGroupId) {
      const group = transferGroups.get(tx.transferGroupId) ?? []
      group.push(tx)
      transferGroups.set(tx.transferGroupId, group)
    }
  }

  const processedTransferGroups = new Set<string>()
  const items: DisplayTransactionItem[] = []

  for (const tx of transactions) {
    if (tx.type === 'transfer' && tx.transferGroupId) {
      if (processedTransferGroups.has(tx.transferGroupId)) {
        continue // Already displayed as part of the grouped transfer entry
      }
      processedTransferGroups.add(tx.transferGroupId)

      const group = transferGroups.get(tx.transferGroupId) ?? []
      const sourceTx = group.find((t) => t.transferRole === 'source')
      const destTx = group.find((t) => t.transferRole === 'destination')

      if (sourceTx && destTx) {
        items.push({
          kind: 'transfer',
          transferGroupId: tx.transferGroupId,
          sourceTransaction: sourceTx,
          destinationTransaction: destTx,
          sourceAccount: sourceTx.accountId ? accountMap.get(sourceTx.accountId) : undefined,
          destinationAccount: destTx.accountId ? accountMap.get(destTx.accountId) : undefined,
          amountPaise: sourceTx.amountPaise,
          transactionDate: sourceTx.transactionDate,
          description: sourceTx.description || destTx.description || 'Account Transfer',
        })
      } else {
        // Data is incomplete or malformed (e.g. one side is missing)
        items.push({
          kind: 'malformed_transfer',
          transferGroupId: tx.transferGroupId,
          transactions: group,
          error: `Incomplete transfer record: found ${group.length} of 2 required sides.`,
        })
      }
    } else {
      // Standard income, expense, or refund
      items.push({
        kind: 'standard',
        transaction: tx,
        category: tx.categoryId ? categoryMap.get(tx.categoryId) : undefined,
        account: tx.accountId ? accountMap.get(tx.accountId) : undefined,
      })
    }
  }

  return items
}
