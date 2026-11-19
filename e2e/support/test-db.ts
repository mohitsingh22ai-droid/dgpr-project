/**
 * Test Environment Database and Storage Seed Utility
 * Resets state to known baseline before test execution:
 * - Customer A: Sarah Jenkins (past order W2P-2026-00101, saved design, active proof)
 * - Customer B: customerb@example.com (isolation testing)
 * - Admin: Marcus Vance (Production Head)
 */

export interface TestSeedState {
  customerA: {
    id: string;
    email: string;
    orders: Array<{ id: string; orderNumber: string; stage: string; totalCents: number }>;
    savedDesigns: Array<{ id: string; name: string }>;
    proofs: Array<{ id: string; version: number; status: string }>;
  };
  customerB: {
    id: string;
    email: string;
    orders: Array<{ id: string; orderNumber: string; stage: string }>;
    proofs: Array<{ id: string; version: number; status: string }>;
  };
  admin: {
    id: string;
    email: string;
  };
}

export function getInitialSeedState(): TestSeedState {
  return {
    customerA: {
      id: "usr-cust-1",
      email: "sarah@enduroclub.uk",
      orders: [
        {
          id: "ord-seed-01",
          orderNumber: "W2P-2026-00101",
          stage: "PROOF",
          totalCents: 14400,
        },
      ],
      savedDesigns: [
        {
          id: "des-seed-01",
          name: "Enduro MTB Frame Kit 2026",
        },
      ],
      proofs: [
        {
          id: "prf-ord-seed-01-v1",
          version: 1,
          status: "pending_review",
        },
      ],
    },
    customerB: {
      id: "usr-cust-2",
      email: "customerb@example.com",
      orders: [
        {
          id: "ord-seed-02",
          orderNumber: "W2P-2026-00202",
          stage: "ORDER",
        },
      ],
      proofs: [
        {
          id: "prf-ord-seed-02-v1",
          version: 1,
          status: "approved",
        },
      ],
    },
    admin: {
      id: "usr-admin-01",
      email: "admin@w2p.co.in",
    },
  };
}
