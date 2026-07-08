-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled product',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "role" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "prompt" TEXT,
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "costPennies" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "reusedCutout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalAssetId" TEXT,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_finalAssetId_fkey" FOREIGN KEY ("finalAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
