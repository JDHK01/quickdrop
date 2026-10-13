# QuickDrop

QuickDrop 是一个轻量公开文件托管与 URL 管理服务。页面无需登录，上传后的资源使用不可枚举 ID 生成公开 URL，可直接分享或嵌入其他页面。

## 功能

- 拖放、文件选择和剪贴板粘贴上传
- 逐文件上传进度、取消与失败重试
- 图片缩略图、资源搜索、链接与 Markdown 复制、资源打开
- 列表读取、单项读取、重命名和删除资源
- 文件名与规范 URL 同步更新，旧名称 URL 自动跳转
- 中文文件名与常见图片、音视频类型
- 实时预览框：在相邻主机之间同步复制动态文本
- 非 root、只读、限额 Docker 容器

## 使用说明

使用部署者提供的访问地址，无需登录。公开仓库不包含实际服务器地址。

1. 在“实时预览”框输入需要在相邻主机之间传递的文本；打开同一页面的其他主机会通过实时连接自动看到更新。
2. 将文件拖入上传区域，或点击“选择文件”；也可以直接粘贴剪贴板中的图片或文件。
3. 等待文件显示“上传完成”。应用不限制单个文件大小，实际容量以服务器剩余磁盘为准。
4. 在资源列表中点击文件名或打开图标访问资源，点击双页图标复制可分享 URL。
5. 点击剪贴板图标复制 Markdown：图片生成 `![文件名](URL)`，其他文件生成 `[文件名](URL)`，可直接粘贴到 Typora 或 Markdown 文档。
6. 使用搜索框按文件名筛选资源；点击铅笔图标可重命名文件并更新规范 URL。
7. 点击删除图标并确认后会永久删除服务器上的文件和元数据，此操作不可恢复。

资源 ID 在重命名前后保持不变。重命名会生成包含新文件名的规范 URL，旧文件名 URL 会以 `308` 跳转到新地址。

## 上传组件

上传交互基于 GitHub 开源项目 FilePond 实现，使用固定版本并随应用本地提供静态资源，不依赖第三方 CDN。FilePond 采用 MIT 许可证，提供拖放、文件选择、剪贴板粘贴、进度、取消和失败重试能力。

## 部署

要求 Docker Engine 与 Docker Compose。首次部署时，在自己的维护环境中设置 `PUBLIC_BASE_URL` 为实际访问地址；不要把该地址提交到公开仓库：

```sh
export PUBLIC_BASE_URL='<填写你的服务访问地址>'
./scripts/init-env.sh "$PUBLIC_BASE_URL"
docker compose up -d --build
docker compose ps
```

资源和元数据保存在宿主机的 `data/`，不包含在镜像和 Git 中。

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
| `MAX_FILES_PER_UPLOAD` | `10` | 单次 API 请求的文件数量上限 |
| `MAX_PREVIEW_CHARS` | `65536` | 实时预览文本的最大字符数 |

修改 `.env` 后运行 `docker compose up -d` 使配置生效。实时预览内容保存在 `data/preview.json`，最多保留 `MAX_PREVIEW_CHARS` 个字符。

应用不限制单个文件大小，实际可上传容量取决于服务器剩余磁盘空间、网络链路和可能存在的上游代理限制。

## 资源 API

所有接口均无需登录。新增、重命名和删除请求需带 `X-QuickDrop-Request: 1` 请求头。

| 操作 | 方法与路径 |
| --- | --- |
| 读取资源列表 | `GET /api/files` |
| 读取单个资源 | `GET /api/files/:id` |
| 上传新增资源 | `POST /api/files`，multipart 字段名为 `files` |
| 重命名资源 | `PATCH /api/files/:id`，JSON 字段为 `originalName` |
| 删除资源 | `DELETE /api/files/:id` |
| 读取实时预览 | `GET /api/preview` |
| 推送实时预览 | `GET /api/preview/events`（SSE） |
| 更新实时预览 | `PUT /api/preview`，JSON 字段为 `text` |
| 访问文件内容 | `GET /f/:id/:filename` |

示例（`PUBLIC_BASE_URL` 由部署者在本地环境中设置）：

```sh
curl "${PUBLIC_BASE_URL}/api/files"

curl -H 'X-QuickDrop-Request: 1' \
  -F 'files=@./photo.jpg' \
  "${PUBLIC_BASE_URL}/api/files"

curl -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'X-QuickDrop-Request: 1' \
  -d '{"originalName":"new-name.jpg"}' \
  "${PUBLIC_BASE_URL}/api/files/RESOURCE_ID"

curl -X DELETE \
  -H 'X-QuickDrop-Request: 1' \
  "${PUBLIC_BASE_URL}/api/files/RESOURCE_ID"
```

列表、单项和写操作返回的资源对象均包含 `id`、`originalName`、`size`、`contentType`、`uploadedAt` 和 `url`，可直接建立 URL 与文件资源的映射。

## 数据与备份

Git 只备份源码和开发历史，不包含 `.env`、上传资源与实时预览内容。源码仓库为 JDHK01/quickdrop，远端名为 `origin`。

```sh
git status --short
git log --oneline --decorate -10
git add <本次修改的源码文件>
git commit -m "说明本次修改"
git push origin main
git ls-remote origin refs/heads/main
```

推送需要 GitHub 写入权限；部署服务器不保存个人 GitHub 私钥或访问令牌。若服务器没有推送权限，可在已有 GitHub 授权的维护机器临时建立服务器仓库的 bare 镜像，再将 `main` 推送到 GitHub；推送后删除临时镜像。不要将实际服务器地址、`.env`、`data/`、备份归档或用户上传文件加入 Git。

文件内容位于 `data/files/`，对应元数据位于 `data/meta/`，实时预览位于 `data/preview.json`。资源数据需要单独备份，一致性备份可按以下方式执行：

```sh
docker compose stop app
tar -C data -czf "quickdrop-data-$(date +%Y%m%d-%H%M%S).tar.gz" files meta preview.json
docker compose start app
```

删除操作不可恢复，应将 `data/` 纳入服务器的定期备份或云硬盘快照。

## 安全边界

页面和管理 API 按设计完全公开，任何能访问 `8008` 端口的人都可以读取列表、上传、重命名、删除资源和更新实时预览。`X-QuickDrop-Request` 只是请求格式校验，不是身份认证。应通过腾讯云安全组限制可信来源，或仅在明确接受公开写入风险时向整个公网开放。

未识别为安全媒体类型的文件会使用附件方式下载，并带有禁止内容嗅探和沙箱响应头。长期使用仍建议配置域名与 HTTPS，以保护传输内容不被篡改或旁路读取。
