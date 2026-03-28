use sqlx::sqlite::SqlitePool;
use serde::{Serialize, Deserialize};
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ServerConfig {
    pub id: String,
    pub label: String,
    pub host: String,
    pub user: String,
    pub port: i32,
    pub password_enc: Option<String>,
    pub key_path: Option<String>,
    pub proxy_id: Option<String>,
    pub proxy_type: Option<String>,      // "SSH" | "SOCKS5" | "HTTP"
    pub pre_connect_script: Option<String>, // Command to run before/on jump host
    pub auto_tunnel: Option<bool>,       // Automatically open dynamic -D tunnel
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Bookmark {
    pub id: String,
    pub host_id: String, // 'GLOBAL' or specific host id
    pub title: String,
    pub url: String,
    pub icon: Option<String>,
}

#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
}

impl Db {
    pub async fn new(db_url: &str) -> Result<Self> {
        let pool = SqlitePool::connect(db_url).await?;
        
        // Initial migration
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS server_configs (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                host TEXT NOT NULL,
                user TEXT NOT NULL,
                port INTEGER NOT NULL,
                password_enc TEXT,
                key_path TEXT,
                proxy_id TEXT,
                proxy_type TEXT,
                pre_connect_script TEXT,
                auto_tunnel INTEGER
            )"
        )
        .execute(&pool)
        .await?;

        // Migration: v2.12.0+: Ensure new columns exist
        let _ = sqlx::query("ALTER TABLE server_configs ADD COLUMN proxy_id TEXT").execute(&pool).await;
        let _ = sqlx::query("ALTER TABLE server_configs ADD COLUMN proxy_type TEXT").execute(&pool).await;
        let _ = sqlx::query("ALTER TABLE server_configs ADD COLUMN pre_connect_script TEXT").execute(&pool).await;
        let _ = sqlx::query("ALTER TABLE server_configs ADD COLUMN auto_tunnel INTEGER").execute(&pool).await;

        // Migration: Terminal Logs
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS terminal_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tab_id TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                content BLOB NOT NULL
            )"
        )
        .execute(&pool)
        .await?;

        // Migration: Bookmarks (v2.11.43)
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY,
                host_id TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                icon TEXT
            )"
        )
        .execute(&pool)
        .await?;

        // Migration: UI Preferences (v2.11.48)
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS ui_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )"
        )
        .execute(&pool)
        .await?;

        // Index for performance
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_tab_id ON terminal_logs(tab_id)")
            .execute(&pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_host_id ON bookmarks(host_id)")
            .execute(&pool)
            .await?;

        Ok(Self { pool })
    }

    pub async fn list_bookmarks(&self, host_id: &str) -> Result<Vec<Bookmark>> {
        let bookmarks = sqlx::query_as::<_, Bookmark>("SELECT * FROM bookmarks WHERE host_id = ? OR host_id = 'GLOBAL'")
            .bind(host_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(bookmarks)
    }

    pub async fn save_bookmark(&self, bookmark: &Bookmark) -> Result<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO bookmarks (id, host_id, title, url, icon) 
             VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&bookmark.id)
        .bind(&bookmark.host_id)
        .bind(&bookmark.title)
        .bind(&bookmark.url)
        .bind(&bookmark.icon)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_bookmark(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM bookmarks WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_ui_preference(&self, key: &str, value: &str) -> Result<()> {
        sqlx::query("INSERT OR REPLACE INTO ui_preferences (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_ui_preferences(&self) -> Result<Vec<(String, String)>> {
        let rows = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM ui_preferences")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows)
    }

    #[allow(dead_code)]
    pub async fn append_log(&self, tab_id: &str, content: &[u8]) -> Result<()> {
        sqlx::query("INSERT INTO terminal_logs (tab_id, content) VALUES (?, ?)")
            .bind(tab_id)
            .bind(content)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_logs(&self, tab_id: &str, limit: i32) -> Result<Vec<Vec<u8>>> {
        let rows = sqlx::query_as::<_, (Vec<u8>,)>("SELECT content FROM terminal_logs WHERE tab_id = ? ORDER BY id DESC LIMIT ?")
            .bind(tab_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|r| r.0).rev().collect())
    }

    pub async fn list_servers(&self) -> Result<Vec<ServerConfig>> {
        let servers = sqlx::query_as::<_, ServerConfig>("SELECT * FROM server_configs")
            .fetch_all(&self.pool)
            .await?;
        Ok(servers)
    }

    pub async fn save_server(&self, server: &ServerConfig) -> Result<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO server_configs (id, label, host, user, port, password_enc, key_path, proxy_id, proxy_type, pre_connect_script, auto_tunnel) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&server.id)
        .bind(&server.label)
        .bind(&server.host)
        .bind(&server.user)
        .bind(&server.port)
        .bind(&server.password_enc)
        .bind(&server.key_path)
        .bind(&server.proxy_id)
        .bind(&server.proxy_type)
        .bind(&server.pre_connect_script)
        .bind(&server.auto_tunnel)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_server(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM server_configs WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
