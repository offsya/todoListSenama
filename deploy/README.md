# todoListSenamaSoft: запуск из готовых образов

Список задач с регистрацией: API (Node.js + MongoDB), веб-клиент и веб-версия мобильного приложения. Всё запускается из готовых образов с [Docker Hub](https://hub.docker.com/r/offsya/todolistsenamasoft), исходники не нужны.

Нужен только Docker (на Windows — Docker Desktop с WSL 2). Настраивать ничего не нужно: секрет для подписи токенов API сгенерирует сам при первом запуске.

## Одной командой

В любой папке:

```bash
docker compose -f oci://docker.io/offsya/todolistsenamasoft:compose up -d
```

Compose скачает описание стека и все образы, включая MongoDB, и запустит их.

Остановить (задачи и пользователи сохранятся):

```bash
docker compose -p todolistsenamasoft down
```

## Из этой папки

1. Если рядом лежит архив с образами, загрузите его (иначе образы скачаются с Docker Hub сами):
   ```bash
   docker load -i todolistsenamasoft-images.tar.gz
   ```
2. Запустите:
   ```bash
   docker compose up -d
   ```

Остановить: `docker compose down`.

## Адреса

| Адрес                 | Что там                                                   |
| --------------------- | --------------------------------------------------------- |
| http://localhost:8080 | Веб-клиент                                                |
| http://localhost:8082 | Мобильное приложение (веб-сборка Expo)                    |
| http://localhost:4000 | API — для мобильного приложения на телефоне или эмуляторе |

Образы собраны для `linux/amd64`. На Mac с Apple Silicon Docker Desktop запускает их через эмуляцию.
