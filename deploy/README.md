# todoListSenamaSoft: запуск из готовых образов

Список задач с регистрацией: API (Node.js + MongoDB), веб-клиент и веб-версия мобильного приложения. Здесь всё запускается из готовых образов с [Docker Hub](https://hub.docker.com/r/offsya/todolistsenamasoft), исходники не нужны.

Нужен только Docker (на Windows — Docker Desktop с WSL 2).

## Одной командой

Создайте пустую папку, а в ней файл `.env` с одной строкой: `JWT_SECRET=` и любая случайная строка от 32 символов. Затем выполните в этой папке:

```bash
docker compose -f oci://docker.io/offsya/todolistsenamasoft:compose up -d
```

Compose скачает описание стека и все образы, включая MongoDB. Перед запуском он покажет найденные переменные и спросит подтверждение — ответьте `Y`. В этой таблице `JWT_SECRET` может значиться как `<unset>`, но значение всё равно берётся из `.env`.

Остановить (задачи и пользователи сохранятся в volume):

```bash
docker compose -p todolistsenamasoft down
```

## Из этой папки

1. Скопируйте `.env.example` в `.env` и впишите в `JWT_SECRET` любую случайную строку от 32 символов.
2. Если вам прислали архив с образами, загрузите его (иначе образы скачаются с Docker Hub сами):
   ```bash
   docker load -i todolistsenamasoft-images.tar.gz
   ```
3. Запустите:
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
