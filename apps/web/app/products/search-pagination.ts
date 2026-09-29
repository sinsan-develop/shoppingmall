type ProductWithId = { productId: string };

export function mergeProductPage<T extends ProductWithId>(current: T[], incoming: T[], nextPage: number) {
  const seen = new Set(current.map((product) => product.productId));
  const products = [...current];
  let firstNewId: string | null = null;
  for (const product of incoming) {
    if (seen.has(product.productId)) continue;
    if (firstNewId === null) firstNewId = product.productId;
    seen.add(product.productId);
    products.push(product);
  }
  const hasMore = firstNewId !== null && incoming.length === 24 && nextPage < 1000;
  return { products, firstNewId, hasMore, ended: !hasMore };
}
