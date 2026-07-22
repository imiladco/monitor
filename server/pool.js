// Runs an async worker over items with bounded concurrency. Never rejects —
// each item's error is caught and returned in results[i].error, so one failing
// check can't abort the whole sweep. Order of results matches input order.
export async function runPool(items, limit, worker) {
  const list = [...items];
  const results = new Array(list.length);
  let next = 0;

  const size = Math.max(1, Math.min(limit, list.length));
  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const i = next++;
      if (i >= list.length) return;
      try {
        results[i] = { value: await worker(list[i], i) };
      } catch (error) {
        results[i] = { error };
      }
    }
  });

  await Promise.all(runners);
  return results;
}
