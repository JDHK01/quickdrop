# QuickDrop

QuickDrop 是一个轻量公开文件托管与 URL 管理服务。页面无需登录，上传后的资源使用不可枚举 ID 生成公开 URL，可直接分享或嵌入其他页面。

## 功能

- 拖放、文件选择和剪贴板粘贴上传
- 逐文件上传进度与大小限制
- 图片缩略图、资源搜索、链接复制和打开
- 列表读取、单项读取、重命名和删除资源
- 文件名与规范 URL 同步更新，旧名称 URL 自动跳转
- 中文文件名与常见图片、音视频类型
- 非 root、只读、限额 Docker 容器

## 部署

要求 Docker Engine 与 Docker Compose。首次部署：

```sh
./scripts/init-env.sh ${PUBLIC_BASE_URL}
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
| `MAX_FILE_SIZE_MB` | `256` | 单个文件大小上限 |
| `MAX_FILES_PER_UPLOAD` | `10` | 单次 API 请求的文件数量上限 |

修改 `.env` 后运行 `docker compose up -d` 使配置生效。

## 资源 API

所有接口均无需登录。新增、重命名和删除请求需带 `X-QuickDrop-Request: 1` 请求头。

| 操作 | 方法与路径 |
| --- | --- |
| 读取资源列表 | `GET /api/files` |
| 读取单个资源 | `GET /api/files/:id` |
| 上传新增资源 | `POST /api/files`，multipart 字段名为 `files` |
| 重命名资源 | `PATCH /api/files/:id`，JSON 字段为 `originalName` |
| 删除资源 | `DELETE /api/files/:id` |
| 访问文件内容 | `GET /f/:id/:filename` |

示例：

```sh
curl ${PUBLIC_BASE_URL}/api/files

curl -H 'X-QuickDrop-Request: 1' \
  -F 'files=@./photo.jpg' \
  ${PUBLIC_BASE_URL}/api/files

curl -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'X-QuickDrop-Request: 1' \
  -d '{"originalName":"new-name.jpg"}' \
  ${PUBLIC_BASE_URL}/api/files/RESOURCE_ID

curl -X DELETE \
  -H 'X-QuickDrop-Request: 1' \
  ${PUBLIC_BASE_URL}/api/files/RESOURCE_ID
```

列表、单项和写操作返回的资源对象均包含 `id`、`originalName`、`size`、`contentType`、`uploadedAt` 和 `url`，可直接建立 URL 与文件资源的映射。

## 数据与备份

文件内容位于 `data/files/`，对应元数据位于 `data/meta/`。一致性备份可按以下方式执行：

```sh
docker compose stop app
tar -C data -czf "quickdrop-data-$(date +%Y%m%d-%H%M%S).tar.gz" files meta
docker compose start app
```

删除操作不可恢复，应将 `data/` 纳入服务器的定期备份或云硬盘快照。

## 安全边界

页面和管理 API 按设计完全公开，任何能访问 `8008` 端口的人都可以读取列表、上传、重命名和删除资源。`X-QuickDrop-Request` 只是请求格式校验，不是身份认证。应通过腾讯云安全组限制可信来源，或仅在明确接受公开写入风险时向整个公网开放。

未识别为安全媒体类型的文件会使用附件方式下载，并带有禁止内容嗅探和沙箱响应头。长期使用仍建议配置域名与 HTTPS，以保护传输内容不被篡改或旁路读取。
