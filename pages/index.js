import Head from 'next/head'
import Header from '@components/Header'
import Footer from '@components/Footer'
import QrCodeGenerator from 'pages/QrCodeGenerator';

export default function Home() {
  return (
    <div className="container">
      <Head>
        <title>Amazon Station Codes</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
      <Header />
        <div>
          <QrCodeGenerator />
        </div>
      </main>

      <Footer />
    </div>
  )
}
