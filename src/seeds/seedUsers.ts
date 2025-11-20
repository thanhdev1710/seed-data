import { usersDB } from "../prisma";
import { redis } from "../redis";

export async function seedUsers() {
  console.log("→ Seed usernames vào Redis...");

  const existing = await redis.scard("usernames");
  if (existing > 0) {
    console.log(`   Set usernames đã có ${existing} entries → bỏ qua`);
    return;
  }

  const users = await usersDB.profile.findMany({
    select: { username: true },
  });

  const list = users
    .map((u: any) => u.username?.trim().toLowerCase())
    .filter(Boolean) as string[];

  if (list.length > 0) {
    await redis.sadd("usernames", ...list);
  }

  console.log(`   ✔ Seed usernames xong (${list.length} entries)`);
}
