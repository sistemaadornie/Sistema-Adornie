# Sistema Operon - App Mobile

App Flutter para iOS e Android conectado ao backend Express existente.

## Pré-requisitos

- Flutter SDK >= 3.19.0 ([instalar](https://docs.flutter.dev/get-started/install))
- Android Studio (para Android) ou Xcode 15+ (para iOS)
- Backend rodando (`cd backend && npm start`)

## Setup inicial

```bash
cd mobile

# 1. Gerar arquivos da plataforma (android/, ios/)
flutter create . --project-name operon_mobile --org com.operon

# 2. Instalar dependências
flutter pub get

# 3. Rodar no emulador
flutter run
```

## Configurar a URL do backend

Edite `lib/core/constants/api_constants.dart`:

```dart
// Android emulator → backend na máquina host
static const String baseUrl = 'http://10.0.2.2:3001/api';

// iOS simulator
static const String baseUrl = 'http://localhost:3001/api';

// Produção (Render)
static const String baseUrl = 'https://sua-api.onrender.com/api';
```

## Permissões necessárias

### Android (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS (`ios/Runner/Info.plist`)
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Para atualizar sua foto de perfil</string>
<key>NSCameraUsageDescription</key>
<string>Para tirar foto de perfil</string>
```

## Estrutura do projeto

```
lib/
├── main.dart                    # Entry point
├── app.dart                     # MaterialApp + GoRouter
├── core/
│   ├── api/api_client.dart      # Dio + refresh automático de token
│   ├── auth/                    # Auth state (Riverpod)
│   ├── models/user_model.dart
│   ├── storage/secure_storage.dart
│   ├── constants/api_constants.dart
│   └── theme/app_theme.dart
├── features/
│   ├── auth/                    # Login + Cadastro empresa
│   ├── home/                    # Dashboard com KPIs
│   ├── agendamentos/            # Lista, Detalhe, Formulário
│   ├── clientes/                # Lista, Detalhe, Formulário
│   ├── notificacoes/            # Lista com badge
│   ├── relatorios/              # Gráficos fl_chart
│   └── perfil/                  # Perfil + upload de foto
└── shared/
    ├── widgets/                 # Loading, Empty state, Status badge
    └── extensions/date_extensions.dart
```

## Build para produção

```bash
# Android APK
flutter build apk --release

# Android App Bundle (Google Play)
flutter build appbundle --release

# iOS (requer Mac + Xcode)
flutter build ios --release
```
