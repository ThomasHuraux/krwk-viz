// Euclidean rhythm generator (Bjorklund algorithm)
// Distributes k hits as evenly as possible over n steps.
// Returns an array of 0/1 of length n.
export function euclidean(n, k, offset = 0) {
  if (k <= 0) return new Array(n).fill(0);
  if (k >= n) return new Array(n).fill(1);

  // Bjorklund via Euclidean subtraction
  let ones    = k;
  let zeros   = n - k;
  let pattern = [];

  // Build initial groups
  let groups = [];
  for (let i = 0; i < ones;  i++) groups.push([1]);
  let remainders = [];
  for (let i = 0; i < zeros; i++) remainders.push([0]);

  while (remainders.length > 1) {
    const newGroups     = [];
    const newRemainders = [];
    const min = Math.min(groups.length, remainders.length);
    for (let i = 0; i < min; i++) {
      newGroups.push([...groups[i], ...remainders[i]]);
    }
    // whatever's left becomes new remainders
    if (groups.length > remainders.length) {
      for (let i = min; i < groups.length; i++) newRemainders.push(groups[i]);
    } else {
      for (let i = min; i < remainders.length; i++) newRemainders.push(remainders[i]);
    }
    groups     = newGroups;
    remainders = newRemainders;
    if (remainders.length <= 1) break;
  }
  pattern = groups.flat().concat(remainders.flat());

  // Apply rotation offset
  if (offset) {
    const o = ((offset % n) + n) % n;
    pattern = [...pattern.slice(o), ...pattern.slice(0, o)];
  }
  return pattern;
}
