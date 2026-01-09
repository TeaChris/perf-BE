import { WelcomeEmailData } from '@/common';

const welcomeEmail = (data: WelcomeEmailData) => {
        return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">

  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <title>Welcome to Flash!</title>
  </head>

  <body>
    <table align="center" width="100%" class="" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:24rem;width:100%;color:rgb(72,72,72);margin-left:auto;margin-right:auto">
      <tbody>
        <tr style="width:100%">
          <td>
            <style>
              @font-face {
                font-family: 'Manrope';
                font-style: normal;
                font-weight: 400;
                mso-font-alt: 'sans-serif';
                src: url(https://fonts.gstatic.com/s/manrope/v15/xn7gYHE41ni1AdIRggexSg.woff2) format('woff2');
              }

              * {
                font-family: 'Manrope', sans-serif;
              }
            </style>
            <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">Welcome to Flash!
            </div>
            
            <h1 style="font-size:1.25rem;line-height:1.75rem;letter-spacing:0.025em;font-weight:700;text-align:center">Welcome to Flash!</h1>
           
            <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <p class="" style="font-size:1.25rem;line-height:1.75rem;margin:16px 0">Hi, ${data.username}</p>
                    <p class="" style="font-size:14px;line-height:24px;margin:16px 0">We’re glad to have you onboard! You’re already on your way to unique assets.</p>
                    <p style="font-size:14px;line-height:24px;margin:16px 0">Whether you’re here for yourself, for a cause, or just for fun — welcome!</p>
                    <p style="font-size:14px;line-height:24px;margin:16px 0">To complete your registration and secure your account, please verify your email using the email verification link below</p>
                  </td>
                </tr>
              </tbody>
            </table><a style="color:rgb(255,255,255);text-decoration:none;background-color:rgb(43,144,142);padding-left:1.75rem;padding-right:1.75rem;padding-top:0.5rem;padding-bottom:0.5rem;margin-top:0.75rem;margin-bottom:0.75rem;border-radius:0.375rem;text-align:center;margin-left:auto;margin-right:auto;cursor:pointer" target="_blank" href=${data.verificationLink}>Verify your email</a>
            <p style="font-size:14px;line-height:24px;margin:16px 0">Not able to click the button above ? Copy and paste the following link into your browser: ${data.verificationLink} </p>
            <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top: -1.5rem;">
              <tbody>
                <tr>
                  <td>
                    <p style="font-size:14px;line-height:24px;margin:16px 0">If there&#x27;s anything you need, we&#x27;ll be here every step of the way.</p>
                    <p style="font-size:14px;line-height:24px;margin:16px 0">Thanks,<br />The team</p>
                  </td>
                </tr>
              </tbody>
            </table>
            <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <p style="font-size:0.875rem;line-height:1.25rem;margin:16px 0">This email was sent to <span style="color:rgb(43,144,142);font-weight:500;text-decoration-line:underline">${data.email}</span> because you signed up for an account on Flash</p>
                    <p style="font-size:14px;line-height:24px;margin:16px 0">© 2025 Flash</p>
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
            
           
            <p style="font-size:14px;line-height:24px;margin:16px 0;text-align:center">Your journey into buying unique assets</p>
          </td>
        </tr>
      </tbody>
    </table>
  </body>

</html>`;
};

export { welcomeEmail };
