<div align="center">
  <img src="asset/logo.svg" width="128">
  <h1>TeleHole</h1>

  An anonymous hole built with Telegram Bots
</div>

## Usage

### Configuration

Configuration is done by setting the following environment variables.

```ini
HOLE_BOT_TOKEN=<Bot Token>
HOLE_CHANNEL=<Channel name, without prefix @>
HOLE_MONGO_URL=<MongoDB URL>
HOLE_MONGO_DB=<MongoDB Database>
```

### Docker

```sh
docker run --env-file .env --restart always -d ghcr.io/thezzisu/telehole
```

### From code

Run the program using `yarn start`.
