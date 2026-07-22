export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Sem padding/centralização aqui: `/login` é a única rota deste grupo e
  // monta seu próprio layout de tela cheia (painel de marca + card).
  return <main className="min-h-screen">{children}</main>;
}
