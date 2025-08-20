import { describe, it, expect, beforeEach } from "vitest";

interface BatchData {
  type: string;
  amount: bigint;
  timestamp: bigint;
  status: number;
}

interface HistoryEntry {
  from: string;
  to: string;
  timestamp: bigint;
  action: string;
}

const STATUS_COLLECTED = 0;
const STATUS_IN_TRANSIT = 1;
const STATUS_RECEIVED = 2;
const STATUS_DISPOSED = 3;
const STATUS_RECYCLED = 4;

const ROLE_ADMIN = 0;
const ROLE_COLLECTOR = 1;
const ROLE_FACILITY = 2;
const ROLE_RECYCLER = 3;

const mockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  nextBatchId: 1n,
  roles: new Map<string, number>(),
  batchOwners: new Map<bigint, string>(),
  batchData: new Map<bigint, BatchData>(),
  batchHistory: new Map<bigint, HistoryEntry[]>(),

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  hasRole(user: string, requiredRole: number) {
    return this.roles.get(user) === requiredRole;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  assignRole(caller: string, user: string, role: number) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.roles.set(user, role);
    return { value: true };
  },

  createBatch(caller: string, wasteType: string, amount: bigint) {
    if (this.paused) return { error: 105 };
    if (!this.hasRole(caller, ROLE_COLLECTOR)) return { error: 100 };
    if (wasteType.length === 0 || wasteType.length > 32) return { error: 107 };
    if (amount <= 0n) return { error: 106 };
    const batchId = this.nextBatchId;
    this.batchData.set(batchId, { type: wasteType, amount, timestamp: 100n, status: STATUS_COLLECTED });
    this.batchOwners.set(batchId, caller);
    this.batchHistory.set(batchId, [{ from: caller, to: caller, timestamp: 100n, action: "collected" }]);
    this.nextBatchId += 1n;
    return { value: batchId };
  },

  transferCustody(caller: string, batchId: bigint, newOwner: string) {
    if (this.paused) return { error: 105 };
    const data = this.batchData.get(batchId);
    if (!data) return { error: 101 };
    if (this.batchOwners.get(batchId) !== caller) return { error: 110 };
    if (!this.hasRole(newOwner, ROLE_FACILITY) && !this.hasRole(newOwner, ROLE_RECYCLER)) return { error: 100 };
    if (data.status !== STATUS_COLLECTED && data.status !== STATUS_IN_TRANSIT && data.status !== STATUS_RECEIVED) return { error: 104 };
    this.batchOwners.set(batchId, newOwner);
    this.batchData.set(batchId, { ...data, status: STATUS_IN_TRANSIT });
    const history = this.batchHistory.get(batchId) || [];
    history.push({ from: caller, to: newOwner, timestamp: 101n, action: "transferred" });
    this.batchHistory.set(batchId, history);
    return { value: true };
  },

  receiveBatch(caller: string, batchId: bigint) {
    if (this.paused) return { error: 105 };
    const data = this.batchData.get(batchId);
    if (!data) return { error: 101 };
    if (this.batchOwners.get(batchId) !== caller) return { error: 110 };
    if (!this.hasRole(caller, ROLE_FACILITY) && !this.hasRole(caller, ROLE_RECYCLER)) return { error: 100 };
    if (data.status !== STATUS_IN_TRANSIT) return { error: 104 };
    this.batchData.set(batchId, { ...data, status: STATUS_RECEIVED });
    const history = this.batchHistory.get(batchId) || [];
    history.push({ from: caller, to: caller, timestamp: 102n, action: "received" });
    this.batchHistory.set(batchId, history);
    return { value: true };
  },

  disposeBatch(caller: string, batchId: bigint, method: string) {
    if (this.paused) return { error: 105 };
    const data = this.batchData.get(batchId);
    if (!data) return { error: 101 };
    if (this.batchOwners.get(batchId) !== caller) return { error: 110 };
    if (!this.hasRole(caller, ROLE_FACILITY)) return { error: 100 };
    if (data.status !== STATUS_RECEIVED) return { error: 104 };
    this.batchData.set(batchId, { ...data, status: STATUS_DISPOSED });
    const history = this.batchHistory.get(batchId) || [];
    history.push({ from: caller, to: caller, timestamp: 103n, action: `disposed-${method}` });
    this.batchHistory.set(batchId, history);
    return { value: true };
  },

  recycleBatch(caller: string, batchId: bigint, method: string) {
    if (this.paused) return { error: 105 };
    const data = this.batchData.get(batchId);
    if (!data) return { error: 101 };
    if (this.batchOwners.get(batchId) !== caller) return { error: 110 };
    if (!this.hasRole(caller, ROLE_RECYCLER)) return { error: 100 };
    if (data.status !== STATUS_RECEIVED) return { error: 104 };
    this.batchData.set(batchId, { ...data, status: STATUS_RECYCLED });
    const history = this.batchHistory.get(batchId) || [];
    history.push({ from: caller, to: caller, timestamp: 104n, action: `recycled-${method}` });
    this.batchHistory.set(batchId, history);
    return { value: true };
  },
};

describe("CycleWorks Waste Tracking Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.nextBatchId = 1n;
    mockContract.roles = new Map();
    mockContract.batchOwners = new Map();
    mockContract.batchData = new Map();
    mockContract.batchHistory = new Map();
  });

  it("should allow admin to assign roles", () => {
    const result = mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ imp", ROLE_COLLECTOR);
    expect(result).toEqual({ value: true });
    expect(mockContract.roles.get("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ imp")).toBe(ROLE_COLLECTOR);
  });

  it("should create a new batch for collector", () => {
    mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", ROLE_COLLECTOR);
    const result = mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    expect(result).toEqual({ value: 1n });
    expect(mockContract.batchData.get(1n)?.type).toBe("plastic");
    expect(mockContract.batchData.get(1n)?.amount).toBe(100n);
    expect(mockContract.batchData.get(1n)?.status).toBe(STATUS_COLLECTED);
    expect(mockContract.batchOwners.get(1n)).toBe("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ");
    expect(mockContract.batchHistory.get(1n)?.length).toBe(1);
  });

  it("should prevent creating batch if not collector", () => {
    const result = mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    expect(result).toEqual({ error: 100 });
  });

  it("should transfer custody to facility", () => {
    mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", ROLE_COLLECTOR);
    mockContract.assignRole(mockContract.admin, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", ROLE_FACILITY);
    mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    const result = mockContract.transferCustody("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(result).toEqual({ value: true });
    expect(mockContract.batchOwners.get(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(mockContract.batchData.get(1n)?.status).toBe(STATUS_IN_TRANSIT);
    expect(mockContract.batchHistory.get(1n)?.length).toBe(2);
  });

  it("should receive batch at facility", () => {
    mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", ROLE_COLLECTOR);
    mockContract.assignRole(mockContract.admin, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", ROLE_FACILITY);
    mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    mockContract.transferCustody("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    const result = mockContract.receiveBatch("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1n);
    expect(result).toEqual({ value: true });
    expect(mockContract.batchData.get(1n)?.status).toBe(STATUS_RECEIVED);
    expect(mockContract.batchHistory.get(1n)?.length).toBe(3);
  });

  it("should dispose batch at facility", () => {
    mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", ROLE_COLLECTOR);
    mockContract.assignRole(mockContract.admin, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", ROLE_FACILITY);
    mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    mockContract.transferCustody("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    mockContract.receiveBatch("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1n);
    const result = mockContract.disposeBatch("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1n, "landfill");
    expect(result).toEqual({ value: true });
    expect(mockContract.batchData.get(1n)?.status).toBe(STATUS_DISPOSED);
    expect(mockContract.batchHistory.get(1n)?.length).toBe(4);
    expect(mockContract.batchHistory.get(1n)?.[3].action).toBe("disposed-landfill");
  });

  it("should recycle batch at recycler", () => {
    mockContract.assignRole(mockContract.admin, "ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", ROLE_COLLECTOR);
    mockContract.assignRole(mockContract.admin, "ST4REJ3YCMZ9QYWVYZV28P2KDVNZY9RE2BTMVYD0", ROLE_RECYCLER);
    mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    mockContract.transferCustody("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", 1n, "ST4REJ3YCMZ9QYWVYZV28P2KDVNZY9RE2BTMVYD0");
    mockContract.receiveBatch("ST4REJ3YCMZ9QYWVYZV28P2KDVNZY9RE2BTMVYD0", 1n);
    const result = mockContract.recycleBatch("ST4REJ3YCMZ9QYWVYZV28P2KDVNZY9RE2BTMVYD0", 1n, "melt");
    expect(result).toEqual({ value: true });
    expect(mockContract.batchData.get(1n)?.status).toBe(STATUS_RECYCLED);
    expect(mockContract.batchHistory.get(1n)?.length).toBe(4);
    expect(mockContract.batchHistory.get(1n)?.[3].action).toBe("recycled-melt");
  });

  it("should not allow actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.createBatch("ST2CY5V39NHDP5P0TP2K5DPZ2AFZ", "plastic", 100n);
    expect(result).toEqual({ error: 105 });
  });
});