# Ein Dockerfile, zwei Ziele: `api` (API und Hintergrundprozess, gleiches Abbild) und `web`
# (statisches Bündel hinter nginx). Beide teilen sich dieselbe Baustufe — zwei getrennte
# Dateien hießen, den Arbeitsbereich zweimal zu installieren und zweimal zu bauen.
#
#   docker compose build          # nutzt die Ziele aus docker-compose.yml
#   docker build -f infra/docker/Dockerfile --target api .
#
# Alle Abbilder sind Alpine-basiert und quelloffen; es wird nichts aus einer Cloud bezogen.

# --- Grundlage ---------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Abhängigkeiten ----------------------------------------------------------------------
# Erst nur die Manifeste kopieren: solange sich keine Abhängigkeit ändert, bleibt diese
# Schicht im Zwischenspeicher und die Installation entfällt.
FROM base AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/catalog/package.json packages/catalog/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# Nur Laufzeitabhängigkeiten — daraus entsteht das node_modules des API-Abbilds.
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store

# --- Bauen -------------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm -r build

# --- API und Hintergrundprozess ----------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
# Der Datenträger für hochgeladene Nachweise; die Anwendung legt darunter je Mandant ab.
ENV STORAGE_LOCAL_DIR=/data/files
COPY --from=prod-deps /app /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/catalog/dist packages/catalog/dist
COPY --from=build /app/packages/catalog/data packages/catalog/data
COPY --from=build /app/packages/db/dist packages/db/dist
# Die Migrationen sind SQL-Dateien und werden zur Laufzeit gelesen, nicht kompiliert.
COPY --from=build /app/packages/db/migrations packages/db/migrations
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 3000
# Ein eigener Benutzer, kein root: eine Anwendung, die fremde Dateien entgegennimmt, läuft
# nicht mit den Rechten, die sie nicht braucht.
CMD ["node", "apps/api/dist/main.js"]

# --- Oberfläche --------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
