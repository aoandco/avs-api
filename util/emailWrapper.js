const bayogEmailWrapper = (body) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Bayog Mail</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #e6f4ea; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding: 40px 0;">
          <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
            
            <!-- Logo -->
            <tr>
              <td align="center" style="padding: 30px 0 10px 0;">
                <img src="https://res.cloudinary.com/dgeafv96s/image/upload/v1763104830/aoco_logo_h32ucb.jpg" width="150" alt="ao-co Logo">
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 40px; color: #1b4332; font-size: 16px; line-height: 1.6;">
                ${body}
                <br><br>
                <p style="margin-top: 40px;">Warm regards,<br><strong>AO & CO Team</strong></p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td bgcolor="#d8f3dc" style="padding: 30px 40px; color: #2d6a4f; font-size: 12px; border-top: 1px solid #95d5b2;">
                <p>Stay connected:</p>
                <p>
                  <a href="https://facebook.com"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="20" alt="Facebook" style="margin-right: 10px;"></a>
                  <a href="https://instagram.com"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="20" alt="Instagram"></a>
                  <a href="https://twitter.com"><img src="https://cdn-icons-png.flaticon.com/512/733/733635.png" width="20" alt="Twitter" style="margin-left: 10px;"></a>
                </p>
                <p style="margin-top: 10px;">
                  © ${new Date().getFullYear()} AO & CO Ltd. <br>
                  10A Innovation Drive, Ikeja GRA, Lagos, Nigeria
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

module.exports = { bayogEmailWrapper };
