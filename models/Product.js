const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  brand: {
    type: String
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: "GNF"
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  images: [{
    type: String
  }],
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  ageRange: {
    minMonths: { type: Number },
    maxMonths: { type: Number }
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes for better query performance
productSchema.index({ categoryId: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ isFeatured: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema, 'products');