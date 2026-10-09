package com.lnt.chatmee.controller;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;

class ControllerArchitectureTest {
    @Test void controllers_allClasses_haveNoRepositoryFieldsOrOAuth2UserParameters() throws Exception {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new org.springframework.core.type.filter.AnnotationTypeFilter(org.springframework.stereotype.Controller.class));
        var controllers = scanner.findCandidateComponents("com.lnt.chatmee.controller");
        assertThat(controllers).isNotEmpty();
        for (var definition : controllers) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            for (var field : type.getDeclaredFields()) {
                assertThat(field.getType().getPackageName()).as(type.getSimpleName() + "." + field.getName())
                        .doesNotStartWith("com.lnt.chatmee.repository");
            }
            for (var method : type.getDeclaredMethods()) {
                for (var parameter : method.getParameterTypes()) {
                    assertThat(parameter).isNotEqualTo(org.springframework.security.oauth2.core.user.OAuth2User.class);
                }
            }
        }
    }
}
