# 邮迹更新发布流程

## 什么时候会提示新版本

邮迹只有在安装版运行时才会检查线上更新。开发模式不会检查更新。

检查更新需要一个可下载的发布目录，目录里必须同时放这三个文件：

- `邮迹-Setup-版本号-x64.exe`
- `邮迹-Setup-版本号-x64.exe.blockmap`
- `latest.yml`

## 发布到 GitHub Release

1. 修改 `package.json` 里的 `version`，例如从 `1.0.1` 改成 `1.0.2`。
2. 运行 `npm run dist:installer`。
3. 在 GitHub 仓库创建对应 tag 的 Release，例如 `v1.0.2`。
4. 上传 `release` 目录中同版本的安装包、`.blockmap` 和 `latest.yml`。
5. 把 `build/update-config.json` 的 `url` 改成 Release 下载目录，例如：

```json
{
  "url": "https://github.com/你的用户名/你的仓库/releases/download/v1.0.2"
}
```

6. 再运行一次 `npm run dist:installer`，生成带更新源配置的安装包。

已经安装旧版本的用户打开邮迹后，会自动检查这个地址下的 `latest.yml`。如果 `latest.yml` 里的版本号比本机版本新，就会下载并提示重启安装。
