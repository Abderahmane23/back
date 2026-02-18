// routes/notificationRoutes.js
const nodemailer = require('nodemailer');

async function notificationRoutes(fastify, options) {
  
  // POST /api/notifications/call-request
  // Send email notification when user clicks call button
  fastify.post('/call-request', async (request, reply) => {
    try {
      const { productId, productName } = request.body;

      if (!productId || !productName) {
        return reply.code(400).send({ 
          success: false, 
          message: 'Product ID and name required' 
        });
      }

      // Create email transporter (using Gmail as example)
      // You'll need to set up app-specific password in Gmail
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: process.env.EMAIL_PASSWORD || 'your-app-password'
        }
      });

      // Email content
      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: 'abder4it@gmail.com',
        subject: `📞 Demande d'information produit - ${productName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">📞 Nouvelle demande d'information</h2>
            <p>Un client a cliqué sur le bouton "Appeler" pour le produit suivant :</p>
            
            <div style="background: #f3f4f6; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
              <p><strong>Produit :</strong> ${productName}</p>
              <p><strong>ID Produit :</strong> ${productId}</p>
              <p><strong>Date/Heure :</strong> ${new Date().toLocaleString('fr-FR')}</p>
            </div>
            
            <p style="color: #6b7280;">
              Le client devrait vous appeler au <strong>610438208</strong> prochainement.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0;">
            <p style="font-size: 0.875rem; color: #9ca3af;">
              Cette notification a été générée automatiquement par le système Pièces Auto Market.
            </p>
          </div>
        `,
        text: `
Nouvelle demande d'information

Produit: ${productName}
ID Produit: ${productId}
Date/Heure: ${new Date().toLocaleString('fr-FR')}

Le client devrait vous appeler au 610438208 prochainement.
        `
      };

      // Send email
      await transporter.sendMail(mailOptions);

      fastify.log.info(`Email notification sent for product: ${productName}`);

      return { 
        success: true, 
        message: 'Notification envoyée avec succès' 
      };

    } catch (error) {
      fastify.log.error('Error sending notification:', error);
      
      // Don't fail the call action if email fails
      return { 
        success: true, 
        message: 'Appel initié',
        emailSent: false 
      };
    }
  });
}

module.exports = notificationRoutes;
