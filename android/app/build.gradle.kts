// (AGP 9 compiles Kotlin itself: no Kotlin plugin to apply)
plugins {
    id("com.android.application")
}

// The app carries the version of the web app (package.json), so a GitHub release vX.Y.Z and its APK agree.
val webVersion = (groovy.json.JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val versionParts = webVersion.substringBefore('-').split('.').map { it.toInt() }

// Release signing from the environment (the release workflow sets these from repository secrets). Without them a
// release build is signed with the debug key, which is fine for trying it out but cannot update an installed release.
val keystoreFile: String? = System.getenv("AW_KEYSTORE_FILE")

android {
    namespace = "io.github.thnonl.agentworkspace"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.thnonl.agentworkspace"
        minSdk = 26
        targetSdk = 36
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        versionName = webVersion
        buildConfigField("String", "REPO", "\"thnonl/agent-workspace\"")
    }

    signingConfigs {
        create("release") {
            if (keystoreFile != null) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("AW_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("AW_KEY_ALIAS")
                keyPassword = System.getenv("AW_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (keystoreFile != null) "release" else "debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
