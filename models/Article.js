const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  summary: {
    type: String,
    required: true
  },
  coverImage: {
    type: String
  },
  ageGroup: {
    type: String // "0-6 mois", "6-12 mois", "1-2 ans", etc.
  },
  sections: [{
    heading: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    }
  }],
  featuredProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  tags: [{
    type: String
  }],
  displayOrder: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  viewCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Indexes for better query performance
articleSchema.index({ slug: 1 });
articleSchema.index({ title: 'text', summary: 'text' });
articleSchema.index({ isPublished: 1 });
articleSchema.index({ displayOrder: 1 });

module.exports = mongoose.model('Article', articleSchema, 'articles');