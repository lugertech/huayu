use huayu_server::{Application, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "huayu_server=info,tower_http=warn".into()),
        )
        .init();
    Application::new(Config::from_env()?).await?.run().await?;
    Ok(())
}
