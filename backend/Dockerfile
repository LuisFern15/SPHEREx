# Backend de SPHEREx Explorer para un Space de Hugging Face (SDK Docker, puerto 7860).
# También sirve para cualquier host de contenedores: la app escucha en $PORT (7860 por defecto).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    SPHEREX_LIVE_IRSA=1 \
    PORT=7860

# Hugging Face ejecuta el contenedor con el usuario 1000; la carpeta debe ser suya
# para que consulta_viva.py pueda escribir la caché de recortes (backend/cache).
RUN useradd -m -u 1000 usuario
WORKDIR /home/usuario/app

COPY --chown=usuario requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY --chown=usuario . .
RUN mkdir -p cache data && chown -R usuario:usuario /home/usuario/app

USER usuario
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
