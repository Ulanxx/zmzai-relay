import mongoose from "mongoose";

import { getServerEnv } from "@/config/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var zmzaiRelayMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.zmzaiRelayMongooseCache ?? {
  conn: null,
  promise: null,
};

if (process.env.NODE_ENV !== "production") {
  global.zmzaiRelayMongooseCache = cache;
}

/** 全局缓存连接，serverless/常驻实例复用，避免 warm invocation 重连。 */
export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    const uri = getServerEnv().MONGODB_URI;
    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 5000,
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
