import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Header } from "./components/Header";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Upload } from "./pages/Upload";
import { Receipts } from "./pages/Receipts";
import { ReceiptDetail } from "./pages/ReceiptDetail";

// HashRouter keeps deep links working on GitHub Pages, which has no server-side routing.
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/app/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
          <Route path="/app/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
          <Route path="/app/receipts/:id" element={<ProtectedRoute><ReceiptDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
