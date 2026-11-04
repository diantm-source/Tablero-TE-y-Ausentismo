FROM node:24.22.0-bookworm

# Evitar prompts interactivos durante la instalación de paquetes
ENV DEBIAN_FRONTEND=noninteractive

# Instalar herramientas esenciales del sistema y compatibilidad completa con Git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    openssh-client \
    gnupg2 \
    curl \
    wget \
    ca-certificates \
    procps \
    sudo \
    zsh \
    bash-completion \
    && rm -rf /var/lib/apt/lists/*

# Inicializar Git LFS
RUN git lfs install --system

# Configurar permisos sudo sin contraseña para el usuario 'node' (UID/GID 1000)
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# Cambiar al usuario no-root 'node'
USER node

# Directorio de trabajo en el devcontainer
WORKDIR /workspaces/PANEL_TE_A

# Configurar Git para aceptar directorios compartidos del host sin advertencias de 'dubious ownership'
RUN git config --global --add safe.directory '*'

# Exponer el puerto por defecto de Vite
EXPOSE 5173

# Variables de entorno por defecto
ENV NODE_ENV=development
