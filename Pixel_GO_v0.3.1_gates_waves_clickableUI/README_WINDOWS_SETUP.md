# Pixel PVE — запуск на Windows (быстрый)

Если после `npm run dev` ловишь ошибки вида **"Application Control policy has blocked"** или **"vite: not found"**, запускай проект через готовый скрипт.

## Самый простой способ

1) Установи **Node.js LTS 20** (рекомендуется). Node 24 часто ломает Vite/Rollup.
2) В корне проекта запусти:

```
START_DEV_WINDOWS.bat
```

Скрипт:
- разблокирует файлы проекта (если Windows пометил их как "скачано из интернета"),
- удалит `node_modules` и `package-lock.json`,
- выполнит `npm install`,
- запустит `npm run dev`.

## Ручной запуск (если нужно)

```
rd /s /q node_modules
del package-lock.json
npm install
npm run dev
```

## Если всё равно пишет "Application Control policy has blocked"

Это уже политика Windows (Smart App Control / WDAC / AppLocker).
Попробуй:

1) ПКМ по ZIP **до распаковки** → Properties → **Unblock** → Apply → распаковать заново.
2) Или в PowerShell в папке проекта:

```powershell
Get-ChildItem -Recurse . | Unblock-File
```
