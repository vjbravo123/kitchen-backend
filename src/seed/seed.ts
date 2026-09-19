/**
 * Sample data for local testing.
 *
 *   npm run seed
 *
 * Creates a verified vendor, a small ingredient inventory and the
 * "Chocolate Cake" recipe used throughout the documentation.
 *
 * Login after seeding:  demo@kitchen.test  /  Demo@1234
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Ingredient, IngredientDocument } from '../ingredients/schemas/ingredient.schema';
import { Recipe, RecipeDocument, WastageBasis, WastageType } from '../recipes/schemas/recipe.schema';
import { Production, ProductionDocument } from '../production/schemas/production.schema';
import {
  InventoryTransaction,
  InventoryTransactionDocument,
} from '../inventory/schemas/inventory-transaction.schema';
import { PriceHistory, PriceHistoryDocument } from '../ingredients/schemas/price-history.schema';
import { VendorsService } from '../vendors/vendors.service';
import { IngredientsService } from '../ingredients/ingredients.service';

const DEMO_EMAIL = 'demo@kitchen.test';
const DEMO_PASSWORD = 'Demo@1234';

async function run() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const vendorModel = app.get<Model<Vendor>>(getModelToken(Vendor.name));
  const ingredientModel = app.get<Model<Ingredient>>(getModelToken(Ingredient.name));
  const recipeModel = app.get<Model<Recipe>>(getModelToken(Recipe.name));
  const productionModel = app.get<Model<Production>>(getModelToken(Production.name));
  const txModel = app.get<Model<InventoryTransaction>>(
    getModelToken(InventoryTransaction.name),
  );
  const historyModel = app.get<Model<PriceHistory>>(getModelToken(PriceHistory.name));
  const vendorsService = app.get(VendorsService);
  const ingredientsService = app.get(IngredientsService);

  // --- vendor ------------------------------------------------------------
  let vendor = await vendorModel.findOne({ email: DEMO_EMAIL });
  if (vendor) {
    logger.log('Existing demo vendor found - clearing its data');
    await Promise.all([
      ingredientModel.deleteMany({ vendor: vendor._id }),
      recipeModel.deleteMany({ vendor: vendor._id }),
      productionModel.deleteMany({ vendor: vendor._id }),
      txModel.deleteMany({ vendor: vendor._id }),
      historyModel.deleteMany({ vendor: vendor._id }),
    ]);
  } else {
    vendor = await vendorModel.create({
      name: 'Demo Chef',
      email: DEMO_EMAIL,
      password: await vendorsService.hashPassword(DEMO_PASSWORD),
      businessName: 'Demo Home Kitchen',
      isEmailVerified: true,
      isActive: true,
    });
  }

  const vendorId = vendor._id.toString();

  // --- ingredients -------------------------------------------------------
  const seedIngredients = [
    { name: 'Chocolate', unit: 'kg', purchasePrice: 500, purchaseQuantity: 1, openingQuantity: 5, minimumStockLevel: 1, supplier: 'Sweet Supplies Co.' },
    { name: 'Flour', unit: 'kg', purchasePrice: 60, purchaseQuantity: 1, openingQuantity: 25, minimumStockLevel: 5 },
    { name: 'Sugar', unit: 'kg', purchasePrice: 45, purchaseQuantity: 1, openingQuantity: 20, minimumStockLevel: 4 },
    { name: 'Eggs', unit: 'piece', purchasePrice: 84, purchaseQuantity: 12, openingQuantity: 60, minimumStockLevel: 12 },
    { name: 'Butter', unit: 'kg', purchasePrice: 520, purchaseQuantity: 1, openingQuantity: 3, minimumStockLevel: 1 },
    { name: 'Milk', unit: 'ltr', purchasePrice: 62, purchaseQuantity: 1, openingQuantity: 10, minimumStockLevel: 2 },
  ];

  const created: Record<string, IngredientDocument> = {};
  for (const item of seedIngredients) {
    const doc = await ingredientsService.create(vendorId, item as any);
    created[item.name] = doc;
    logger.log(`Ingredient: ${doc.name} @ Rs.${doc.costPerBaseUnit}/${doc.baseUnit}`);
  }

  // --- recipe ------------------------------------------------------------
  // Chocolate Cake, 1 kg batch: 200g chocolate, 300g flour, 200g sugar, 4 eggs
  const recipe = await recipeModel.create({
    vendor: new Types.ObjectId(vendorId),
    name: 'Chocolate Cake',
    description: 'Classic 1 kg chocolate cake',
    baseServings: 1,
    servingUnit: 'kg',
    items: [
      { ingredient: created['Chocolate']._id, quantity: 200, unit: 'g', baseQuantity: 200 },
      { ingredient: created['Flour']._id, quantity: 300, unit: 'g', baseQuantity: 300 },
      { ingredient: created['Sugar']._id, quantity: 200, unit: 'g', baseQuantity: 200 },
      { ingredient: created['Eggs']._id, quantity: 4, unit: 'piece', baseQuantity: 4 },
    ],
    packagingCost: 30,
    laborCost: 80,
    utilityCost: 20,
    wastageType: WastageType.PERCENTAGE,
    wastageValue: 3,
    wastageBasis: WastageBasis.INGREDIENT,
    sellingPrice: 700,
    scaleOverheads: true,
  });

  const banana = await recipeModel.create({
    vendor: new Types.ObjectId(vendorId),
    name: 'Banana Bread',
    description: 'Single loaf',
    baseServings: 1,
    servingUnit: 'loaf',
    items: [
      { ingredient: created['Flour']._id, quantity: 250, unit: 'g', baseQuantity: 250 },
      { ingredient: created['Sugar']._id, quantity: 150, unit: 'g', baseQuantity: 150 },
      { ingredient: created['Butter']._id, quantity: 100, unit: 'g', baseQuantity: 100 },
      { ingredient: created['Eggs']._id, quantity: 2, unit: 'piece', baseQuantity: 2 },
      { ingredient: created['Milk']._id, quantity: 100, unit: 'ml', baseQuantity: 100 },
    ],
    packagingCost: 20,
    laborCost: 50,
    utilityCost: 15,
    wastageType: WastageType.FIXED,
    wastageValue: 10,
    sellingPrice: 350,
  });

  logger.log('');
  logger.log('Seed complete.');
  logger.log(`  Login:      ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  logger.log(`  Recipes:    ${recipe.name} (${recipe._id}), ${banana.name} (${banana._id})`);
  logger.log(`  Try:        GET /api/recipes/${recipe._id}/cost?servings=2`);
  logger.log('');

  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
