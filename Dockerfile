# Use official lightweight Node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy rest of source code
COPY . .

# Cloud Run requires the container to listen on this port
ENV PORT=8080

# Inform Docker the app uses this port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
