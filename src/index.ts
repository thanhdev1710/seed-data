// src/index.ts
import { usersDB, postsDB } from "./prisma"; // client nhiều DB
import { redis } from "./redis"; // Redis
import { es } from "./elastic"; // Elasticsearch client

import { seedUsers } from "./seeds/seedUsers"; // Seed Redis usernames
import { reindexPostsToElastic } from "./seeds/seedPost";

async function main() {
  console.log("=========================================");
  console.log("🔥 GLOBAL SEED START");
  console.log("=========================================");

  try {
    // 1) Seed usernames từ DB UserService -> Redis
    console.log("\n👉 [1/2] Seeding usernames vào Redis...");
    await seedUsers();
    console.log("✅ Done seed usernames.");

    // 2) Reindex toàn bộ bài viết từ PostService DB -> Elasticsearch
    console.log("\n👉 [2/2] Reindex posts vào Elasticsearch...");
    await reindexPostsToElastic();
    console.log("✅ Done reindex posts.");

    console.log("\n🎉 GLOBAL SEED HOÀN TẤT 🎉");
  } catch (err) {
    console.error("\n❌ GLOBAL SEED ERROR:");
    console.error(err);
  } finally {
    console.log("\n🔌 Đang đóng kết nối...");

    // Disconnect Prisma clients
    try {
      await usersDB.$disconnect();
      await postsDB.$disconnect();
    } catch (e) {
      console.warn("⚠️ Lỗi khi disconnect Prisma:", e);
    }

    // Quit Redis
    try {
      await redis.quit();
    } catch (e) {
      console.warn("⚠️ Lỗi khi disconnect Redis:", e);
    }

    // Close Elasticsearch
    try {
      await es.close();
    } catch (e) {
      console.warn("⚠️ Lỗi khi disconnect Elasticsearch:", e);
    }

    console.log("🔚 Tắt seed job.");
    process.exit(0);
  }
}

// Run
main();
