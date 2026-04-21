from __future__ import annotations

from app.skills.builtins.simple_calculator import SimpleCalculatorSkill
from app.skills.builtins.time_now import TimeNowSkill

# Legal compliance skills — AgentSkills.co.il bundle
from app.skills.builtins.legal.israeli_employment_contracts import IsraeliEmploymentContractsSkill
from app.skills.builtins.legal.israeli_privacy_shield import IsraeliPrivacyShieldSkill
from app.skills.builtins.legal.israeli_ecommerce_compliance import IsraeliEcommerceComplianceSkill
from app.skills.builtins.legal.israeli_rental_agreements import IsraeliRentalAgreementsSkill
from app.skills.builtins.legal.israeli_workplace_rights_navigator import IsraeliWorkplaceRightsNavigatorSkill

from app.skills.registry import registry


def load_builtin_skills() -> None:
    # Utility skills
    registry.register(TimeNowSkill())
    registry.register(SimpleCalculatorSkill())

    # Legal compliance skills (AgentSkills.co.il — legal-compliance bundle)
    registry.register(IsraeliEmploymentContractsSkill())
    registry.register(IsraeliPrivacyShieldSkill())
    registry.register(IsraeliEcommerceComplianceSkill())
    registry.register(IsraeliRentalAgreementsSkill())
    registry.register(IsraeliWorkplaceRightsNavigatorSkill())
