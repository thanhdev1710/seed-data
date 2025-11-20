// src/db/users.ts
import { PrismaClient as UsersDB } from "./generated/users";
export const usersDB = new UsersDB();

// src/db/posts.ts
import { PrismaClient as PostsDB } from "./generated/posts";
export const postsDB = new PostsDB();
