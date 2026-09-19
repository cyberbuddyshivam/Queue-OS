# MonadQueuePlatform - Invariant Verification Suite
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MONAD QUEUE PLATFORM: INVARIANT TEST SUITE              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$passes = 0
$fails = 0

function Assert-Condition($condition, $testName) {
    if ($condition) {
        Write-Host "  [PASS] $testName" -ForegroundColor Green
        $global:passes++
    } else {
        Write-Host "  [FAIL] $testName" -ForegroundColor Red
        $global:fails++
    }
}

# In-Memory Simulated State of MonadQueuePlatform
class SimulatedPlatform {
    [hashtable]$vendors = @{}
    [hashtable]$queues = @{}
    [hashtable]$tickets = @{}
    [hashtable]$hasClaimed = @{} # queueId_user -> bool
    [hashtable]$isScanner = @{}  # queueId_scanner -> bool
    [decimal]$platformTreasuryBalance = 0
    [decimal]$defaultPlatformClaimFee = 0.001
    [decimal]$lowBalanceThreshold = 0.003
    [int]$nextQueueId = 1
    [int]$nextTicketId = 1
    [bool]$lowBalanceEventTriggered = $false

    [void]RegisterVendor([string]$vendor, [int]$planType, [decimal]$deposit) {
        if ($this.vendors.ContainsKey($vendor)) { throw "VendorAlreadyRegistered" }
        $this.vendors[$vendor] = @{
            owner = $vendor
            planType = $planType
            balance = $deposit
            subscriptionExpiresAt = if ($planType -eq 1) { 30 } else { 0 }
            isActive = $true
            totalQueuesCreated = 0
            totalSlotsIssued = 0
            totalCheckIns = 0
        }
    }

    [int]CreateQueue([string]$vendor, [string]$title, [int]$capacity, [decimal]$feePerClaim) {
        if (-not $this.vendors.ContainsKey($vendor)) { throw "VendorNotRegistered" }
        $v = $this.vendors[$vendor]
        if (-not $v.isActive) { throw "VendorNotActive" }
        if ($capacity -le 0) { throw "InvalidCapacity" }

        # Balance Gating Invariant Check
        $effectiveFee = if ($feePerClaim -eq 0) { $this.defaultPlatformClaimFee } else { $feePerClaim }
        if ($v.planType -eq 0 -and $v.balance -lt $effectiveFee) {
            throw "InsufficientVendorBalance"
        }

        $qId = $this.nextQueueId++
        $this.queues[$qId] = @{
            queueId = $qId
            vendor = $vendor
            title = $title
            capacity = $capacity
            claimedCount = 0
            checkedInCount = 0
            feePerClaim = $effectiveFee
            isActive = $true
        }
        $v.totalQueuesCreated++
        $this.isScanner["$($qId)_$($vendor)"] = $true
        return $qId
    }

    [int]ClaimSlot([int]$queueId, [string]$claimant) {
        if (-not $this.queues.ContainsKey($queueId)) { throw "QueueNotFound" }
        $q = $this.queues[$queueId]
        if (-not $q.isActive) { throw "QueueNotActive" }
        if ($q.claimedCount -ge $q.capacity) { throw "QueueCapacityReached" }
        
        $claimKey = "$($queueId)_$($claimant)"
        if ($this.hasClaimed.ContainsKey($claimKey)) { throw "UserAlreadyClaimed" }

        $v = $this.vendors[$q.vendor]
        if (-not $v.isActive) { throw "VendorNotActive" }

        # Usage Metering Accounting
        if ($v.planType -eq 0) {
            if ($v.balance -lt $q.feePerClaim) { throw "InsufficientVendorBalance" }
            $v.balance -= $q.feePerClaim
            $this.platformTreasuryBalance += $q.feePerClaim

            if ($v.balance -lt $this.lowBalanceThreshold) {
                $this.lowBalanceEventTriggered = $true
            }
        }

        $q.claimedCount++
        $tId = $this.nextTicketId++
        $this.tickets[$tId] = @{
            ticketId = $tId
            queueId = $queueId
            claimant = $claimant
            slotIndex = $q.claimedCount
            checkedIn = $false
        }
        $this.hasClaimed[$claimKey] = $true
        $v.totalSlotsIssued++
        return $tId
    }

    [void]CheckIn([int]$queueId, [int]$ticketId, [string]$scanner) {
        $q = $this.queues[$queueId]
        $scannerKey = "$($queueId)_$($scanner)"
        if ($scanner -ne $q.vendor -and -not $this.isScanner.ContainsKey($scannerKey)) {
            throw "UnauthorizedScanner"
        }

        if (-not $this.tickets.ContainsKey($ticketId)) { throw "TicketNotFound" }
        $t = $this.tickets[$ticketId]
        if ($t.checkedIn) { throw "TicketAlreadyCheckedIn" }

        $t.checkedIn = $true
        $q.checkedInCount++
        $v = $this.vendors[$q.vendor]
        $v.totalCheckIns++
    }

    [void]WithdrawUnusedBalance([string]$caller, [decimal]$amount) {
        if (-not $this.vendors.ContainsKey($caller)) { throw "VendorNotRegistered" }
        $v = $this.vendors[$caller]
        if ($v.balance -lt $amount) { throw "InsufficientVendorBalance" }
        $v.balance -= $amount
    }
}

# --- TEST 1: Balance Gating ---
Write-Host "`n[Test Group 1: Balance Gating]" -ForegroundColor Yellow
$sim = [SimulatedPlatform]::new()
$sim.RegisterVendor("0xVendor1", 0, 0.0) # 0 balance

$caughtBalanceGating = $false
try {
    $sim.CreateQueue("0xVendor1", "Unfunded Queue", 50, 0.001)
} catch {
    if ($_.Exception.Message -eq "InsufficientVendorBalance") {
        $caughtBalanceGating = $true
    }
}
Assert-Condition $caughtBalanceGating "Cannot create queue with 0 prepaid balance"

# Fund vendor and verify queue creation succeeds
$sim.vendors["0xVendor1"].balance = 0.05
$qId = $sim.CreateQueue("0xVendor1", "Funded Queue", 50, 0.001)
Assert-Condition ($qId -eq 1) "Successfully created queue after funding vendor balance"


# --- TEST 2: Usage Metering Accuracy ---
Write-Host "`n[Test Group 2: Usage-Metering Accuracy]" -ForegroundColor Yellow
$balBefore = $sim.vendors["0xVendor1"].balance
$treasuryBefore = $sim.platformTreasuryBalance

$tId1 = $sim.ClaimSlot($qId, "0xUserA")
$balAfter = $sim.vendors["0xVendor1"].balance
$treasuryAfter = $sim.platformTreasuryBalance

Assert-Condition ($balBefore - $balAfter -eq 0.001) "Vendor balance accurately debited by feePerClaim (0.001 MON)"
Assert-Condition ($treasuryAfter - $treasuryBefore -eq 0.001) "Platform treasury accurately credited by feePerClaim (0.001 MON)"
Assert-Condition ($sim.tickets[$tId1].claimant -eq "0xUserA") "Ticket record accurately assigned to claimant"


# --- TEST 3: Double-Claim Prevention ---
Write-Host "`n[Test Group 3: Double-Claim Prevention]" -ForegroundColor Yellow
$caughtDoubleClaim = $false
try {
    $sim.ClaimSlot($qId, "0xUserA") # Duplicate claim by 0xUserA
} catch {
    if ($_.Exception.Message -eq "UserAlreadyClaimed") {
        $caughtDoubleClaim = $true
    }
}
Assert-Condition $caughtDoubleClaim "Reverted duplicate claim by 0xUserA on same queue"

$tId2 = $sim.ClaimSlot($qId, "0xUserB")
Assert-Condition ($tId2 -eq 2) "Distinct user 0xUserB can claim slot successfully"


# --- TEST 4: Capacity Limits ---
Write-Host "`n[Test Group 4: Capacity Limits]" -ForegroundColor Yellow
$sim.vendors["0xVendor1"].balance = 1.0
$tinyQueueId = $sim.CreateQueue("0xVendor1", "Micro Queue", 1, 0.001) # capacity = 1
[void]$sim.ClaimSlot($tinyQueueId, "0xUser1")

$caughtCapacity = $false
try {
    $sim.ClaimSlot($tinyQueueId, "0xUser2")
} catch {
    if ($_.Exception.Message -eq "QueueCapacityReached") {
        $caughtCapacity = $true
    }
}
Assert-Condition $caughtCapacity "Queue rejects claims beyond maximum capacity"


# --- TEST 5: Vendor Withdrawal Permissions ---
Write-Host "`n[Test Group 5: Vendor Withdrawal Authorization]" -ForegroundColor Yellow
$sim.vendors["0xVendor1"].balance = 0.500

$caughtUnauthorized = $false
try {
    $sim.WithdrawUnusedBalance("0xAttacker", 0.100)
} catch {
    if ($_.Exception.Message -eq "VendorNotRegistered") {
        $caughtUnauthorized = $true
    }
}
Assert-Condition $caughtUnauthorized "Non-registered attacker cannot withdraw vendor credits"

$sim.WithdrawUnusedBalance("0xVendor1", 0.200)
Assert-Condition ($sim.vendors["0xVendor1"].balance -eq 0.300) "Vendor owner can withdraw unused balance"

$caughtOverdraw = $false
try {
    $sim.WithdrawUnusedBalance("0xVendor1", 0.500) # Exceeds 0.300
} catch {
    if ($_.Exception.Message -eq "InsufficientVendorBalance") {
        $caughtOverdraw = $true
    }
}
Assert-Condition $caughtOverdraw "Cannot withdraw more than remaining vendor balance"


# --- TEST 6: Check-in & Scanner Authorization ---
Write-Host "`n[Test Group 6: Check-in & Redemption]" -ForegroundColor Yellow
$sim.isScanner["$($qId)_0xScanner1"] = $true

$caughtBadScanner = $false
try {
    $sim.CheckIn($qId, $tId1, "0xRandomPerson")
} catch {
    if ($_.Exception.Message -eq "UnauthorizedScanner") {
        $caughtBadScanner = $true
    }
}
Assert-Condition $caughtBadScanner "Unauthorized address cannot perform attendee check-in"

$sim.CheckIn($qId, $tId1, "0xScanner1")
Assert-Condition ($sim.tickets[$tId1].checkedIn -eq $true) "Authorized scanner successfully checks in attendee"

$caughtDoubleCheckin = $false
try {
    $sim.CheckIn($qId, $tId1, "0xScanner1")
} catch {
    if ($_.Exception.Message -eq "TicketAlreadyCheckedIn") {
        $caughtDoubleCheckin = $true
    }
}
Assert-Condition $caughtDoubleCheckin "Double check-in of already-redeemed ticket is rejected"


# --- TEST 7: Low Balance Alert Event ---
Write-Host "`n[Test Group 7: Low Balance Threshold Alerting]" -ForegroundColor Yellow
$sim.vendors["0xVendor1"].balance = 0.0035 # just above threshold 0.003
[void]$sim.ClaimSlot($qId, "0xUserC") # Debits 0.001 -> leaves 0.0025 (< 0.003)
Assert-Condition ($sim.lowBalanceEventTriggered -eq $true) "VendorBalanceLow event triggers when balance drops below 0.003 MON"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY: $passes PASSED, $fails FAILED" -ForegroundColor $(if ($fails -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================================" -ForegroundColor Cyan

if ($fails -gt 0) { exit 1 }
