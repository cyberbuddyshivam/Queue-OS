/*
 * Envio HyperIndex event handlers for MonadQueuePlatform on Monad Testnet (Chain ID 10143)
 */

import {
  MonadQueuePlatformContract_VendorRegistered_handler,
  MonadQueuePlatformContract_VendorFunded_handler,
  MonadQueuePlatformContract_VendorSubscribed_handler,
  MonadQueuePlatformContract_VendorWithdrawn_handler,
  MonadQueuePlatformContract_VendorBalanceLow_handler,
  MonadQueuePlatformContract_QueueCreated_handler,
  MonadQueuePlatformContract_SlotClaimed_handler,
  MonadQueuePlatformContract_UserCheckedIn_handler,
} from "../generated/src/Handlers.gen";

MonadQueuePlatformContract_VendorRegistered_handler(({ event, context }) => {
  const vendorId = event.params.vendor.toLowerCase();
  context.Vendor.set({
    id: vendorId,
    planType: Number(event.params.planType),
    balance: 0n,
    subscriptionExpiresAt: 0n,
    isActive: true,
    totalQueuesCreated: 0,
    totalSlotsIssued: 0,
    totalCheckIns: 0,
    lowBalanceAlert: false,
  });
});

MonadQueuePlatformContract_VendorFunded_handler(({ event, context }) => {
  const vendorId = event.params.vendor.toLowerCase();
  const existing = context.Vendor.get(vendorId);
  if (existing) {
    context.Vendor.set({
      ...existing,
      balance: event.params.newBalance,
      lowBalanceAlert: false,
    });
  }

  context.BalanceHistory.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    vendor_id: vendorId,
    actionType: "FUND",
    amount: event.params.amount,
    newBalance: event.params.newBalance,
    timestamp: BigInt(event.block.timestamp),
  });
});

MonadQueuePlatformContract_VendorSubscribed_handler(({ event, context }) => {
  const vendorId = event.params.vendor.toLowerCase();
  const existing = context.Vendor.get(vendorId);
  if (existing) {
    context.Vendor.set({
      ...existing,
      subscriptionExpiresAt: event.params.newExpiresAt,
      lowBalanceAlert: false,
    });
  }
});

MonadQueuePlatformContract_VendorWithdrawn_handler(({ event, context }) => {
  const vendorId = event.params.vendor.toLowerCase();
  const existing = context.Vendor.get(vendorId);
  if (existing) {
    context.Vendor.set({
      ...existing,
      balance: event.params.remainingBalance,
    });
  }

  context.BalanceHistory.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    vendor_id: vendorId,
    actionType: "WITHDRAW",
    amount: event.params.amount,
    newBalance: event.params.remainingBalance,
    timestamp: BigInt(event.block.timestamp),
  });
});

MonadQueuePlatformContract_VendorBalanceLow_handler(({ event, context }) => {
  const vendorId = event.params.vendor.toLowerCase();
  const existing = context.Vendor.get(vendorId);
  if (existing) {
    context.Vendor.set({
      ...existing,
      lowBalanceAlert: true,
      balance: event.params.remainingBalance,
    });
  }
});

MonadQueuePlatformContract_QueueCreated_handler(({ event, context }) => {
  const queueId = event.params.queueId.toString();
  const vendorId = event.params.vendor.toLowerCase();

  context.Queue.set({
    id: queueId,
    vendor_id: vendorId,
    title: event.params.title,
    capacity: Number(event.params.capacity),
    claimedCount: 0,
    checkedInCount: 0,
    startTime: event.params.startTime,
    endTime: event.params.endTime,
    isActive: true,
  });

  const vendor = context.Vendor.get(vendorId);
  if (vendor) {
    context.Vendor.set({
      ...vendor,
      totalQueuesCreated: vendor.totalQueuesCreated + 1,
    });
  }
});

MonadQueuePlatformContract_SlotClaimed_handler(({ event, context }) => {
  const ticketId = event.params.ticketId.toString();
  const queueId = event.params.queueId.toString();

  context.SlotTicket.set({
    id: ticketId,
    queue_id: queueId,
    claimant: event.params.claimant.toLowerCase(),
    slotIndex: Number(event.params.slotIndex),
    claimedAt: BigInt(event.block.timestamp),
    checkedIn: false,
    checkedInAt: undefined,
    scanner: undefined,
    txHash: event.transaction.hash,
  });

  const queue = context.Queue.get(queueId);
  if (queue) {
    context.Queue.set({
      ...queue,
      claimedCount: queue.claimedCount + 1,
    });

    const vendor = context.Vendor.get(queue.vendor_id);
    if (vendor) {
      context.Vendor.set({
        ...vendor,
        totalSlotsIssued: vendor.totalSlotsIssued + 1,
      });
    }
  }
});

MonadQueuePlatformContract_UserCheckedIn_handler(({ event, context }) => {
  const ticketId = event.params.ticketId.toString();
  const queueId = event.params.queueId.toString();

  const ticket = context.SlotTicket.get(ticketId);
  if (ticket) {
    context.SlotTicket.set({
      ...ticket,
      checkedIn: true,
      checkedInAt: BigInt(event.block.timestamp),
      scanner: event.params.scanner.toLowerCase(),
    });
  }

  const queue = context.Queue.get(queueId);
  if (queue) {
    context.Queue.set({
      ...queue,
      checkedInCount: queue.checkedInCount + 1,
    });

    const vendor = context.Vendor.get(queue.vendor_id);
    if (vendor) {
      context.Vendor.set({
        ...vendor,
        totalCheckIns: vendor.totalCheckIns + 1,
      });
    }
  }
});
