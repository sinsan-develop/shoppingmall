export type MigrationFile = {
  tag: string;
  when: number;
  hash: string;
  sql: string[];
};

export type AppliedMigration = { createdAt: number; hash: string };

/** Mirror Drizzle's ordered journal while refusing a history that cannot be safely previewed. */
export function planMigrationPreview(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[] {
  for (let index = 0; index < files.length; index += 1) {
    if (!Number.isSafeInteger(files[index].when)
      || (index > 0 && files[index - 1].when >= files[index].when)) {
      throw new Error('Migration journal order is invalid');
    }
  }
  if (applied.length > files.length) throw new Error('Migration history mismatch');
  for (const [index, row] of applied.entries()) {
    if (files[index].when !== row.createdAt || files[index].hash !== row.hash) {
      throw new Error('Migration history mismatch');
    }
  }
  return files.slice(applied.length);
}
