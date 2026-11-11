# jlgrobot UAT Kubernetes 部署说明

> 以下操作由管理员在管理机执行。仓库地址和命名空间为待确认占位符，替换后方可部署。

## 上线前准备

- **本地镜像**：
  - `jlgrobot:1.0.0-amd64`（linux/amd64，已通过本地容器健康检查）
  - `jlgrobot:1.0.0-arm64`（linux/arm64，已通过 `docker image inspect` 验证架构，未单独运行容器健康检查）
- **目标环境**：UAT 测试，`default` 命名空间，`NodePort` Service（不指定固定 nodePort，由集群分配）。
- **部署文件**：`deploy/k8s/uat/` 下的 `configmap.yaml`、`pvc.yaml`、`deployment.yaml`、`service.yaml`。
- **待管理员确认**：
  - 镜像仓库地址及推送权限（占位符 `<REGISTRY>` 需替换）
  - 集群 worker 节点架构（amd64 或 arm64），选择对应镜像标签
  - StorageClass 是否支持动态 PVC（默认使用集群 StorageClass）
  - 是否需要 Ingress 或共享入口（当前仅生成 NodePort Service）
  - 资源 requests/limits 是否符合集群容量

## 1. 推送镜像到仓库

管理员在本机安全登录目标镜像仓库，将已构建的本地镜像标记为集群可访问的完整仓库地址，再推送并验证：

```sh
# amd64 节点
docker login <REGISTRY>
docker tag jlgrobot:1.0.0-amd64 <REGISTRY>/jlgrobot:1.0.0-amd64
docker push <REGISTRY>/jlgrobot:1.0.0-amd64

# arm64 节点
docker tag jlgrobot:1.0.0-arm64 <REGISTRY>/jlgrobot:1.0.0-arm64
docker push <REGISTRY>/jlgrobot:1.0.0-arm64

# 验证
docker buildx imagetools inspect <REGISTRY>/jlgrobot:1.0.0-amd64
```

将 `deployment.yaml` 中的 `image` 替换为实际仓库地址。混合架构集群需按节点架构选择镜像标签或配置节点亲和性；独立标签不能自动选择架构。

## 2. 上传配置并确认集群

将 `deploy/k8s/uat/` 下的 YAML 上传至管理机。本应用无 Secret（auth 为 no-op，无外部数据库），无需创建镜像拉取凭据（除非仓库为私有）。

在管理机检查：

```sh
kubectl config current-context
kubectl get nodes -o wide
kubectl get namespace default
```

确认 worker 节点架构：

```sh
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.nodeInfo.operatingSystem}{"/"}{.status.nodeInfo.architecture}{"\n"}{end}'
```

## 3. 部署资源

按依赖顺序部署（先存储，再配置，最后工作负载和服务）：

```sh
kubectl apply --dry-run=server -f deploy/k8s/uat/pvc.yaml
kubectl apply -f deploy/k8s/uat/pvc.yaml

kubectl apply --dry-run=server -f deploy/k8s/uat/configmap.yaml
kubectl apply -f deploy/k8s/uat/configmap.yaml

kubectl apply --dry-run=server -f deploy/k8s/uat/deployment.yaml
kubectl apply -f deploy/k8s/uat/deployment.yaml

kubectl apply --dry-run=server -f deploy/k8s/uat/service.yaml
kubectl apply -f deploy/k8s/uat/service.yaml
```

## 4. 验收、更新与回滚

```sh
kubectl rollout status deployment/jlgrobot -n default
kubectl get pods -n default -l app=jlgrobot -o wide
kubectl get svc -n default
```

获取 NodePort 并验证健康端点：

```sh
NODE_PORT=$(kubectl get svc jlgrobot -n default -o jsonpath='{.spec.ports[0].nodePort}')
curl http://<任意节点IP>:$NODE_PORT/api/health
# 预期: {"ok":true,"app":"jlgrobot"}
```

业务验证（创建设备 → 记录状态 → 读回）：

```sh
curl -X POST http://<节点IP>:$NODE_PORT/api/equipment -H 'Content-Type: application/json' -d '{"name":"测试机器人","identifier":"JLG-001","type":"mobile-robot"}'
curl http://<节点IP>:$NODE_PORT/api/equipment
```

更新时推送新的固定版本镜像，更新 Deployment 镜像引用并等待 rollout：

```sh
kubectl set image deployment/jlgrobot jlgrobot=<REGISTRY>/jlgrobot:<新版本> -n default
kubectl rollout status deployment/jlgrobot -n default
```

需要回退应用版本时：

```sh
kubectl rollout undo deployment/jlgrobot -n default
kubectl rollout status deployment/jlgrobot -n default
```

Deployment 回滚不会回滚数据库数据；SQLite 数据持久化在 PVC 中，按已验证的备份方案单独处理。

## 注意事项

- **副本数**：当前为 1 副本（SQLite 文件数据库不支持多副本并发写入）。多副本需迁移至外部数据库。
- **数据备份**：SQLite 数据存储在 PVC（`/app/app/jlgrobot/data`），备份前需停止写入或使用 SQLite 在线备份。
- **架构选择**：amd64 集群使用 `jlgrobot:1.0.0-amd64`，arm64 集群使用 `jlgrobot:1.0.0-arm64`；混合集群需配置节点亲和性或使用多平台索引。
