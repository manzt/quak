/*
* Adapted from: https://github.com/uwdata/mosaic/blob/main/packages/duckdb-server-rust/src/db.rs
*
* Copyright (c) 2023, UW Interactive Data Lab
* All rights reserved.
*/
use anyhow::Result;
use duckdb::DuckdbConnectionManager;

pub struct ConnectionPool {
    pool: r2d2::Pool<DuckdbConnectionManager>,
}

impl ConnectionPool {
    pub fn new(db_path: &str, pool_size: u32) -> Result<Self> {
        let manager = DuckdbConnectionManager::file(db_path)?;
        let pool = r2d2::Pool::builder().max_size(pool_size).build(manager)?;
        Ok(Self { pool })
    }

    pub fn get(&self) -> Result<r2d2::PooledConnection<DuckdbConnectionManager>> {
        Ok(self.pool.get()?)
    }
}

impl ConnectionPool {
    pub fn execute(&self, sql: &str) -> Result<()> {
        let conn = self.get()?;
        conn.execute_batch(sql)?;
        Ok(())
    }

    pub fn get_json(&self, sql: &str) -> Result<Vec<u8>> {
        let conn = self.get()?;
        let mut stmt = conn.prepare(sql)?;
        let arrow = stmt.query_arrow([])?;

        let buf = Vec::new();
        let mut writer = arrow::json::ArrayWriter::new(buf);
        for batch in arrow {
            writer.write(&batch)?;
        }
        writer.finish()?;
        Ok(writer.into_inner())
    }

    pub fn get_arrow(&self, sql: &str) -> Result<Vec<u8>> {
        let conn = self.get()?;
        let mut stmt = conn.prepare(sql)?;
        let arrow = stmt.query_arrow([])?;
        let schema = arrow.get_schema();

        let mut buffer: Vec<u8> = Vec::new();
        {
            let schema_ref = schema.as_ref();
            let mut writer = arrow::ipc::writer::FileWriter::try_new(&mut buffer, schema_ref)?;

            for batch in arrow {
                writer.write(&batch)?;
            }

            writer.finish()?;
        }

        Ok(buffer)
    }
}
