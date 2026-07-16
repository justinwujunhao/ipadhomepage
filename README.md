# 家庭 iPad 信息屏

一个跑在 Mac mini 上的本地家庭信息屏。iPad 打开网页后，可以横屏展示留言、备忘、佛山天气和当前时间。

## 启动

```bash
npm start
```

默认地址：

- Mac mini 本机：`http://localhost:8787`
- iPad：`http://<Mac mini 的局域网 IP>:8787`
- 管理页：`http://<Mac mini 的局域网 IP>:8787/admin`

## 背景照片

把照片放进 `public/assets/`，例如 `public/assets/background.jpg`，然后在管理页的“背景图片路径”里填：

```text
/assets/background.jpg
```

## 数据

留言、备忘和设置会保存在 `data/state.json`。服务重启后会继续使用这份数据。

## 天气

默认天气位置是广东省佛山市，使用 Open-Meteo 免密接口。天气由服务端缓存，外网失败时页面会继续显示最后一次成功数据。

## 测试

```bash
npm test
```
