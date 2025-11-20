// src/seeds/reindexPostsToElastic.ts
import { postsDB } from "../prisma"; // PrismaClient cho DB Posts
import { es } from "../elastic"; // Elasticsearch client

export const POSTS_INDEX = "posts_index";

export const postsIndexBody = {
  settings: {
    analysis: {
      filter: {
        vi_ascii_folding: {
          type: "asciifolding",
          preserve_original: true,
        },
        edge_ngram_filter: {
          type: "edge_ngram",
          min_gram: 2,
          max_gram: 20,
        },
      },
      analyzer: {
        vi_search: {
          tokenizer: "standard",
          filter: ["lowercase", "vi_ascii_folding"],
        },
        vi_edge_ngram: {
          tokenizer: "standard",
          filter: ["lowercase", "vi_ascii_folding", "edge_ngram_filter"],
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: "keyword" },

      // ===== AUTHOR =====
      author_id: { type: "keyword" },
      author_avatar: { type: "keyword" },
      author_username: {
        type: "keyword",
        fields: {
          text: {
            type: "text",
            analyzer: "vi_edge_ngram",
            search_analyzer: "vi_search",
          },
        },
      },
      author_fullname: {
        type: "text",
        analyzer: "vi_search",
      },

      // ===== TITLE =====
      title: {
        type: "text",
        analyzer: "vi_search",
        fields: {
          ngram: {
            type: "text",
            analyzer: "vi_edge_ngram",
            search_analyzer: "vi_search",
          },
        },
      },

      // ===== CONTENT =====
      content: {
        type: "text",
        analyzer: "vi_search",
        fields: {
          ngram: {
            type: "text",
            analyzer: "vi_edge_ngram",
            search_analyzer: "vi_search",
          },
        },
      },

      // ===== HASHTAGS =====
      hashtags: {
        type: "keyword",
        fields: {
          text: {
            type: "text",
            analyzer: "vi_edge_ngram",
            search_analyzer: "vi_search",
          },
        },
      },

      // ===== MEDIA =====
      media: {
        type: "nested",
        properties: {
          mediaUrl: { type: "keyword" },
          mediaType: { type: "keyword" }, // image | video | file
        },
      },

      // ===== META =====
      post_type: { type: "keyword" }, // PostTypeEnum
      expired_at: { type: "date" },

      created_at: { type: "date" },
      updated_at: { type: "date" },

      visibility: { type: "keyword" }, // public | friends | private

      like_count: { type: "integer" },
      comment_count: { type: "integer" },
      share_count: { type: "integer" },
    },
  },
};

export async function reindexPostsToElastic() {
  console.log("→ Reindex posts vào Elasticsearch...");

  // 1) Xoá index cũ (nếu có) rồi tạo lại cho sạch mapping
  const exists = await es.indices.exists({ index: POSTS_INDEX });

  if (exists) {
    console.log(`   Index "${POSTS_INDEX}" đã tồn tại, đang xoá...`);
    await es.indices.delete({ index: POSTS_INDEX });
  }

  console.log(`   Đang tạo index "${POSTS_INDEX}" với mapping/settings...`);
  await es.indices.create({
    index: POSTS_INDEX,
    ...postsIndexBody, // settings + mappings
  });
  console.log(`   ✅ Created index: ${POSTS_INDEX}`);

  // 2) Đọc posts từ DB theo batch
  const batchSize = 500;
  let skip = 0;
  let totalIndexed = 0;

  while (true) {
    const posts = await postsDB.posts.findMany({
      skip,
      take: batchSize,
      orderBy: { createdAt: "asc" },
      include: {
        Users: {
          select: {
            id: true,
            username: true,
            fullname: true,
            avatarUrl: true,
          },
        },
        Media: true,
        PostHashtags: {
          include: {
            Hashtag: true,
          },
        },
        Likes: true,
        Comments: true,
        Shares: true,
      },
    });

    if (posts.length === 0) break;

    const body: any[] = [];

    for (const post of posts) {
      // ===== hashtags =====
      const hashtags = post.PostHashtags.map((ph) => ph.Hashtag.name);

      // ===== media =====
      const media = post.Media.map((m) => ({
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      }));

      // ===== counts (ưu tiên field đã denormalized, fallback sang length) =====
      const likeCount = post.likeCount ?? post.Likes.length;
      const commentCount = post.commentCount ?? post.Comments.length;
      const shareCount = post.shareCount ?? post.Shares.length;

      const doc = {
        id: post.id,

        author_id: post.userId,
        author_username: post.Users?.username || "",
        author_fullname: post.Users?.fullname || "",
        author_avatar: post.Users?.avatarUrl || "",

        title: post.title || "",
        content: post.content || "",

        hashtags,
        media,

        post_type: post.postType,
        expired_at: post.expired_at,

        created_at: post.createdAt,
        updated_at: post.updatedAt,
        visibility: post.visibility,

        like_count: likeCount,
        comment_count: commentCount,
        share_count: shareCount,
      };

      body.push({ index: { _index: POSTS_INDEX, _id: post.id } });
      body.push(doc);
    }

    const resp = await es.bulk({
      refresh: true,
      body,
    });

    if (resp.errors) {
      console.error("   ❌ Bulk index gặp lỗi, log vài lỗi mẫu:");
      const erroredItems = (resp.items || []).filter((item: any) => {
        const action = item.index || item.create || item.update;
        return action && action.error;
      });
      console.dir(erroredItems.slice(0, 3), { depth: null });
      throw new Error("Bulk index lỗi, dừng reindex.");
    }

    totalIndexed += posts.length;
    console.log(
      `   ✔ Đã index thêm ${posts.length} posts (tổng = ${totalIndexed})`
    );

    skip += batchSize;
  }

  console.log(`✅ Reindex hoàn tất, tổng cộng ${totalIndexed} posts.`);
}
