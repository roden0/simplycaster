import ThemeToggle from "../islands/ThemeToggle.tsx";

export interface HeaderProps {
  title?: string;
}

export default function Header({ title = "SimplyCaster" }: HeaderProps) {
  return (
    <header class="app-header" role="banner">
      <h1>{title}</h1>
      <nav role="navigation" aria-label="Main navigation">
        <ThemeToggle />
      </nav>
    </header>
  );
}
