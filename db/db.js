import fastifyPostgres from "@fastify/postgres";

export async function setupDatabase(fastify) {
  await fastify.register(fastifyPostgres, {
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ca: process.env.DB_CA_CERT,
          }
        : false,
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  });
}

//legacy pg query helper 
export async function query(text, params) {
  const client = await global.fastify.pg.pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } catch (err) {
    fastify.log.error({ err, query: text }, "Database query error");
    throw err;
  } finally {
    client.release();
  }
}
