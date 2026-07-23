# QuickDrop

QuickDrop 是一个面向个人使用的轻量文件托管服务。管理页面需要密码登录，上传后的资源使用不可枚举 ID 生成公开 URL，可直接分享或嵌入其他页面。

## 功能

- 拖放、文件选择和剪贴板粘贴上传
- 逐文件上传进度与大小限制
- 图片缩略图、资源搜索、链接复制、打开和删除
- 公开资源 URL，无需登录即可访问
- 中文文件名与常见图片、音视频类型
- 登录限流、HttpOnly 会话、请求来源校验与安全响应头
- 非 root、只读、限额 Docker 容器

## 部署

要求 Docker Engine 与 Docker Compose。首次部署：

```sh
./scripts/init-env.sh ${PUBLIC_BASE_URL}
docker compose up -d --build
docker compose ps
```

初始化命令只在第一次运行时创建 `.env`，并打印随机生成的上传密码。资源和元数据保存在宿主机的 `data/`，不包含在镜像和 Git 中。

常用维护命令：

```sh
docker compose logs -f --tail=100
docker compose up -d --build
docker compose restart
docker compose down
```

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | 必填 | 生成分享链接时使用的公开地址 |
| `UPLOAD_PASSWORD` | 必填 | 管理页面登录密码，至少 12 个字符 |
| `SESSION_SECRET` | 必填 | 会话签名密钥，至少 32 个字符 |
| `COOKIE_SECURE` | `false` | 使用 HTTPS 后改为 `true` |
| `MAX_FILE_SIZE_MB` | `256` | 单个文件大小上限 |
| `MAX_FILES_PER_UPLOAD` | `10` | 单次 API 请求的文件数量上限 |
| `SESSION_TTL_MS` | `604800000` | 登录会话有效期，默认 7 天 |

修改 `.env` 后运行 `docker compose up -d` 使配置生效。

## 数据与备份

文件内容位于 `data/files/`，对应元数据位于 `data/meta/`。一致性备份可按以下方式执行：

```sh
docker compose stop app
tar -C data -czf "quickdrop-data-$(date +%Y%m%d-%H%M%S).tar.gz" files meta
docker compose start app
```

删除操作不可恢复，应将 `data/` 纳入服务器的定期备份或云硬盘快照。

## 安全边界

管理 API 需要登录，但分享 URL 按设计公开可读。未识别为安全媒体类型的文件会使用附件方式下载，并带有禁止内容嗅探和沙箱响应头。

直接使用公网 IP 时是明文 HTTP，密码与会话不具备链路加密。长期使用应配置域名与 HTTPS 反向代理，然后将 `PUBLIC_BASE_URL` 改为 HTTPS 地址，并设置 `COOKIE_SECURE=true`。服务器安全组只需对可信来源开放管理端口时，也可以进一步限制 `8008` 的来源地址。
