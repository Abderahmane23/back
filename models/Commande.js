// models/Commande.js
const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  statut: {
    type: String,
    enum: ['en_cours', 'livree'],
    default: 'en_cours'
  },
  adresse: {
    ville: { type: String },
    quartier: { type: String },
    details: { type: String }
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    nom: { type: String },
    quantite: {
      type: Number,
      required: true,
      min: 1
    },
    prixUnitaire: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    }
  }],
  totalCommande: {
    type: Number,
    required: true,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

commandeSchema.index({ userId: 1 });
commandeSchema.index({ statut: 1 });

module.exports = mongoose.model('Commande', commandeSchema);