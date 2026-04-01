'use strict'
const express  = require('express')
const router   = express.Router()
const catalog  = require('../controllers/catalog.controller')

// Feature 1 — Smart Home Feed
router.get('/home',               catalog.getHome)

// Feature 2 — AI Fuzzy Search
router.post('/search',            catalog.search)

// Feature 3 — Voice Search
router.post('/voice-search',      catalog.voiceSearch)

// Feature 4 — Wishlist
router.post('/wishlist',          catalog.addWishlist)
router.delete('/wishlist/:id',    catalog.removeWishlist)
router.get('/wishlist/:clientPhone', catalog.getWishlist)

// Feature 5 — Persistent Cart
router.post('/cart/add',          catalog.addToCart)
router.patch('/cart/update',      catalog.updateCart)
router.delete('/cart/item',       catalog.removeFromCart)
router.get('/cart/:clientPhone',  catalog.getCart)
router.delete('/cart/clear/:clientPhone', catalog.clearCart)

// Feature 6 — Bundles
router.get('/bundles',            catalog.getBundles)
router.get('/bundles/suggest/:productId', catalog.suggestBundles)
router.post('/bundles',           catalog.createBundle)
router.put('/bundles/:id',        catalog.updateBundle)
router.delete('/bundles/:id',     catalog.deleteBundle)

// Feature 7 — Restock Alerts
router.post('/restock-alert',     catalog.addRestockAlert)
router.get('/restock-alerts',     catalog.getRestockAlerts)
router.post('/restock-notify/:productId', catalog.notifyRestock)

// Feature 8 — Photo Search
router.post('/image-search',      catalog.imageSearch)

// Feature 10 — Shipping Calculator
router.post('/shipping-calc',     catalog.shippingCalc)

// Feature 11 — Customizer
router.get('/product/:id/custom-options', catalog.getCustomOptions)
router.post('/cart/add-custom',   catalog.addCustomToCart)

// Feature 9 support — Record product view (for smart sort ranking)
router.post('/view',              catalog.recordView)

module.exports = router
