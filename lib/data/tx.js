// =============================================================================
// TRANSACTION SEAM
//
// Notion has no transactions. A multi-step write (stamp the invoice, move three
// line quantities, log the payment) can fail halfway and leave the books in a
// state that never existed — an invoice marked short-paid with the quantities
// never rolled back, say. Plan/Validate/Commit reduces that risk but cannot
// remove it: the commit phase itself is several separate HTTP calls.
//
// So this is a COMPENSATING journal. Each write registers how to undo itself.
// If a later step throws, we replay the undos in reverse and re-throw. It is not
// a real transaction (a compensation can itself fail, and we say so loudly), but
// it turns "silently half-written" into "rolled back, or told about it".
//
// THE POINT OF THE SEAM: on Postgres this file becomes BEGIN / COMMIT / ROLLBACK
// and every caller stays exactly as it is. Callers already write in the shape a
// transaction needs, so the swap touches this file and the repositories — not
// the business logic, and not the routes.
// =============================================================================

export async function withTransaction(fn) {
  const undos = [];
  const tx = {
    // Register a compensating action for a write that just succeeded.
    // `describe` is a short human string used if compensation itself fails.
    onRollback(describe, undoFn) {
      undos.push({ describe, undoFn });
    },
  };

  try {
    return await fn(tx);
  } catch (err) {
    const failures = [];
    for (const { describe, undoFn } of undos.reverse()) {
      try {
        await undoFn();
      } catch (e) {
        failures.push(`${describe}: ${e.message || e}`);
      }
    }

    if (failures.length) {
      // Compensation failed. This is the one case where data really can be
      // inconsistent, so we refuse to hide it behind the original error.
      const e = new Error(
        `${err.message || err}\n\nWARNING — the rollback did not fully succeed. ` +
        `These changes may still be applied and need checking:\n- ${failures.join("\n- ")}`
      );
      e.rollbackFailed = true;
      e.cause = err;
      throw e;
    }

    // Clean rollback: nothing was left behind.
    throw err;
  }
}
