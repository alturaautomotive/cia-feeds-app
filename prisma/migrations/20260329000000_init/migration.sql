-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "description" TEXT,
    "vin" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" TEXT,
    "bodyStyle" TEXT,
    "price" DOUBLE PRECISION,
    "mileageValue" DOUBLE PRECISION,
    "stateOfVehicle" TEXT,
    "exteriorColor" TEXT,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "missingFields" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_email_key" ON "Dealer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_slug_key" ON "Dealer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_dealerId_url_key" ON "Vehicle"("dealerId", "url");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
