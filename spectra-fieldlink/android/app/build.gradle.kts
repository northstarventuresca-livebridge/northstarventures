plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.northstarventures.spectra"
    compileSdk = 35
    defaultConfig {
        applicationId = "ca.northstarventures.spectra"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-field-test"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            // Official distribution requires a private signing key.
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("androidx.work:work-runtime:2.10.1")
    testImplementation("junit:junit:4.13.2")
}
