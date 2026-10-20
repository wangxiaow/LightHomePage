# 安全边界与回归验证

更新日期：2026-10-20。

## 本次修复

| 问题 | 当前防护 | 回归验证 |
| --- | --- | --- |
| 上游 Vary 允许客户端制造缓存变体 | 开发与生产统一由 Node 处理外部请求，缓存只按校验、规范化后的上游 URL 建立；客户端请求头不参与缓存，外部 Vary 不透传。Nginx 只代理 Node，关闭自身代理缓存 | 变化 Accept-Encoding 和无关查询参数仍命中同一缓存，外部请求仅一次 |
| 反向代理后所有访客共享限流配额 | 增加 TRUSTED_PROXIES 准确 IP 白名单；仅从可信连接读取单个有效 X-Forwarded-For；Nginx 覆盖传入身份头。IP 文本规范化后再限流 | 一个访客收到 429 后另一访客仍为 200；伪造头不能越过入口；非法代理配置拒绝启动 |
| 生产 Nginx 缺少响应总大小限制 | Docker 运行 Node 的流式读取检查：图片 12 MiB、JSON 512 KiB、总耗时 10 秒；完成校验前不向客户端返回内容。缓存总计 24 MiB/150 项；不写磁盘。Nginx 关闭响应落盘和代理缓存 | 无长度头、伪造长度、13 MiB 图片和持续小块响应均受限制；异常内容不缓存，后续请求可恢复 |
| 安全测试未随仓库发布 | 调整 .gitignore 允许提交 test/*.test.mjs、本文档及 CI；增加 npm test | GitHub Actions 配置包含语法检查、Nginx 集成测试、Docker 启动与只读/非 root 检查 |

生产镜像已由 Nginx 改为 Node.js 22 Alpine，不新增 npm 依赖。Compose 内存额度从 64 MiB 调整为 256 MiB，以容纳运行时、缓存和受限的并发下载；V8 堆上限为 96 MiB。容器以非 root 用户、只读根文件系统运行，删除所有 Linux capabilities，保留进程/CPU/日志大小限制，不再挂载磁盘缓存卷。

## 代理信任与部署

- 直接访问时保持 TRUSTED_PROXIES 为空，任何访客提供的转发头都不会改变其配额身份。
- 经过 HTTP/HTTPS 反向代理时，必须将 Node 实际看到的代理连接 IP 列入白名单。原生本机部署通常是 127.0.0.1、::1；Docker 桥接网络需核对宿主机代理地址，不能直接照抄本机地址。
- 入口必须覆盖 X-Forwarded-For 为一个实际客户端 IP；不接受逗号链、端口、主机名、任意网段或通配符。可信代理缺少有效身份时，API 返回 400，不把访客归入共享代理配额。静态页面和健康检查不依赖该头。
- 后端应只允许可信入口连接。不要在访客可以直接访问的后端上盲目信任其来源网络；NAT 把所有连接改写为同一个地址时，应在 NAT 前正确确定访客身份并隔离后端。
- 如果入口前还有 CDN/负载均衡器，应先在入口恢复可信来源提供的真实 IP。具体配置和升级命令见 [README.md](README.md#nginx--https-入口)。
- 必须替换旧版直接代理 Bing/Open-Meteo 的 Nginx 配置，不能只更新前端文件。旧的 wallpaper-cache 卷未自动删除，但新服务不再使用它。

## 其他已保留的防护

- 静态资源采用固定允许列表，不暴露源文件、环境文件和备份。
- 外部代理目标固定为 Bing/Open-Meteo；参数校验、URL 编码、TLS 校验和禁止重定向共同限制代理范围。
- 图片只接收明确的位图 MIME，JSON 必须为 application/json 且可解析。API 返回 sandbox CSP，图片附加 attachment；不会转发上游 Cookie、CORS、Vary 或 X-Accel 控制头。
- 页面使用 textContent/文本节点呈现外部数据；自定义 URL 只接受无凭据的 HTTP/HTTPS。新窗口使用 noopener/noreferrer。
- API 每客户端每分钟 100 次；限流表最多 2000 项；最多 8 个不同的外部请求并行，其中图片最多 2 个。缓存命中/请求合并与全局容量控制独立于每客户端配额。
- 服务器连接数、请求头大小和请求处理时间有边界，拒绝非 GET/HEAD 方法及请求体。前端保留独立的流读取上限。

## 验证与实际限制

本机使用 Node.js 26.7.0 和已有的 Nginx 1.30.6 便携版，语法检查及全部 51 项测试通过（无跳过）。测试只连接回环地址及受控模拟上游，不对线上站点压测。运行方式：

```powershell
$env:BAIYE_NGINX_EXE = 'G:\codex\homepage\test-artifacts\nginx-security\nginx-1.30.6\nginx.exe'
npm run check
npm test
```

Linux 可设置 BAIYE_NGINX_EXE=/usr/sbin/nginx、BAIYE_NGINX_MIME=/etc/nginx/mime.types。未提供 Nginx 时集成测试跳过；CI 配置会提供它。

- 本机未安装 Docker，不能在此验证 Linux 镜像构建、Compose 网络或内核资源限制。已加入 CI 容器启动检查，但本次未推送或运行远程工作流。
- 线上 HTTPS、证书续期、防火墙、真实代理来源、镜像与操作系统补丁状态仍需由部署环境确认。更新时执行 docker compose build --pull，再 docker compose up -d。
- 内存上限与请求配额可限制资源使用，但不保证在分布式攻击或共享上游故障下持续可用。
- 搜索历史保存在当前浏览器；同一浏览器配置文件的使用者可见。用户主动添加的 HTTP 搜索引擎仍使用明文请求。

## 实现依据

可信来源明确配置与入口覆写身份的设计参考 [Nginx Real IP](https://nginx.org/en/docs/http/ngx_http_realip_module.html)。关闭缓存及缓冲落盘的配置参考 [Nginx 代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)。IP 校验使用 [Node net.isIP](https://nodejs.org/docs/latest-v22.x/api/net.html#netisipinput)。只读容器配置见 [Docker Compose](https://docs.docker.com/reference/compose-file/services/#read_only)。
