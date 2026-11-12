plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val embeddedInvite: String = (providers.gradleProperty("spectraTeamInvite").orNull ?: "").also {
    require(it.isEmpty() || Regex("[a-f0-9]{48}").matches(it)) {
        "Team invite must be empty or a valid 48-character invitation token"
    }
}

android {
    buildFeatures { buildConfig = true }
    namespace = "ca.northstarventures.spectra"
    compileSdk = 35
    defaultConfig {
        applicationId = "ca.northstarventures.spectra"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-one-app-beta"
        buildConfigField("String", "TEAM_INVITE", "\"$embeddedInvite\"")
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
